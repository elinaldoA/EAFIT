import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { PROTEIN_SOURCES, QUICK_FOODS } from '../data/proteinSources';
import { useToast } from '../context/useToast';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { fetchNutritionLog, upsertNutritionLog, fetchProteinLogsRange, readLocalTotals, writeLocalTotals } from '../lib/proteinLog';
import { applyFood, EMPTY_TOTALS } from '../lib/nutritionTotals';
import { enqueue } from '../lib/syncQueue';
import { parseLocalDate, toDateStr } from '../lib/utils';
import { buildProteinSeries, proteinStats } from '../lib/proteinStats';
import { computeNutritionGoals } from '../lib/nutritionGoals';
import { fetchCustomFoods, createCustomFood, deleteCustomFood, readCachedFoods } from '../lib/nutritionFoods';
import { sortByUse, bumpUseCount, readUseCounts, MAX_CUSTOM_FOODS, VISIBLE_FOODS } from '../lib/foodShortcuts';
import ProteinBars from '../components/ProteinBars';
import MacroBars from '../components/MacroBars';
import ProfileNutritionSection from '../components/ProfileNutritionSection';
import Skeleton from '../components/Skeleton';

import { t, locale } from '../lib/i18n';
const HISTORY_DAYS = 14;

const fmt = n => n.toLocaleString(locale);
const EMPTY_CUSTOM = { name: '', g: '', kcal: '', carbs: '', fat: '' };

export default function NutricaoPage({ active }) {
  const { user } = useAuth();
  const { markPending } = useWorkout();
  const toast = useToast();
  const goals = useMemo(() => computeNutritionGoals(user?.user_metadata), [user]);
  const goalG = goals?.protein ?? 0;

  const [_tick, setTick] = useState(0);
  const bump = () => setTick(n => n + 1);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  // Últimas adições desta visita, pra "Desfazer" tirar exatamente o que entrou
  // por engano. Vazia (app reaberto), o botão vira um -10 g de proteína.
  const [undoStack, setUndoStack] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState(EMPTY_CUSTOM);
  const [saveShortcut, setSaveShortcut] = useState(false);
  const [myFoods, setMyFoods] = useState(() => (user ? readCachedFoods(user.id) : []));
  const [useCounts, setUseCounts] = useState(readUseCounts);
  const [showAllFoods, setShowAllFoods] = useState(false);
  const [manage, setManage] = useState(false);

  const totals = readLocalTotals();
  const protein = totals.protein;

  useEffect(() => {
    if (!active || !user) return;

    async function load() {
      setLoading(true);
      try {
        const since = parseLocalDate(todayDate());
        since.setDate(since.getDate() - (HISTORY_DAYS - 1));
        const [today, history] = await Promise.all([
          fetchNutritionLog(user.id, todayDate()),
          fetchProteinLogsRange(user.id, toDateStr(since)),
        ]);
        if (today) writeLocalTotals(today);
        setLogs(history);
        bump();
      } catch (err) {
        console.error('loadNutricao:', err);
        toast(t('⚠️ Erro ao carregar dados de nutrição'));
      } finally {
        setLoading(false);
      }
    }
    load();
    fetchCustomFoods(user.id).then(setMyFoods).catch(err => console.error('fetchCustomFoods:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user]);

  // O dia de hoje vem do localStorage (atualizado na hora a cada toque), não
  // do histórico buscado ao abrir a aba.
  const series = useMemo(() => {
    const s = buildProteinSeries(logs, todayDate(), HISTORY_DAYS);
    s[s.length - 1] = { ...s[s.length - 1], g: protein };
    return s;
  }, [logs, protein]);
  const stats = useMemo(() => proteinStats(series, goalG), [series, goalG]);

  function saveTotals(next) {
    writeLocalTotals(next);
    bump();
    if (user) {
      upsertNutritionLog(user.id, todayDate(), next).catch(err => {
        console.error('upsertNutritionLog:', err);
        enqueue('nutrition_log', { userId: user.id, date: todayDate(), totals: next });
        markPending();
      });
    }
  }

  function handleAdd(food) {
    if (food.id) setUseCounts(bumpUseCount(food.id));
    const next = applyFood(totals, food);
    setUndoStack(s => [...s, food].slice(-10));
    if (goalG && next.protein >= goalG && protein < goalG) toast(t('🎉 Meta de proteína do dia atingida!'));
    saveTotals(next);
  }

  function handleUndo() {
    const last = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    saveTotals(last ? applyFood(totals, last, -1) : applyFood(totals, { g: 10 }, -1));
  }

  async function handleCustomSubmit(e) {
    e.preventDefault();
    const food = {
      g: parseInt(custom.g, 10) || 0,
      kcal: parseInt(custom.kcal, 10) || 0,
      carbs: parseInt(custom.carbs, 10) || 0,
      fat: parseInt(custom.fat, 10) || 0,
    };
    const name = custom.name.trim();
    if (!food.g && !food.kcal && !food.carbs && !food.fat) return;
    if (saveShortcut && !name) { toast(t('Dê um nome ao atalho')); return; }
    if (saveShortcut && user) {
      try {
        setMyFoods(await createCustomFood(user.id, { ...food, name }));
        toast(t('Atalho salvo'));
      } catch (err) {
        console.error('createCustomFood:', err);
        toast(t('⚠️ Não foi possível salvar o atalho'));
      }
    }
    handleAdd({ ...food, label: name || undefined });
    setCustom(EMPTY_CUSTOM);
    setSaveShortcut(false);
    setCustomOpen(false);
  }

  async function handleDeleteFood(food) {
    if (!window.confirm(t('Apagar o atalho "{name}"?', { name: food.label }))) return;
    try {
      setMyFoods(await deleteCustomFood(user.id, food.id));
    } catch (err) {
      console.error('deleteCustomFood:', err);
      toast(t('⚠️ Não foi possível apagar o atalho'));
    }
  }

  function handleReset() {
    if (!window.confirm(t('Zerar o que foi registrado hoje?'))) return;
    setUndoStack([]);
    saveTotals(EMPTY_TOTALS);
  }

  const pct = goalG ? Math.min(100, (protein / goalG) * 100) : 0;
  const remaining = Math.max(0, goalG - protein);
  const done = !!goalG && protein >= goalG;
  const allFoods = useMemo(() => sortByUse([...QUICK_FOODS, ...myFoods], useCounts), [myFoods, useCounts]);
  const shownFoods = showAllFoods || manage ? allFoods : allFoods.slice(0, VISIBLE_FOODS);
  const undoFood = undoStack[undoStack.length - 1];
  const hasLog = totals.protein + totals.kcal + totals.carbs + totals.fat > 0;

  return (
    <section id="page-nutricao" className="page active">
      <div className={`water-hero water-hero--protein${done ? ' water-hero--done' : ''}`}>
        <div className="water-hero__ring" style={{ '--pct': pct }} role="img" aria-label={t('{v1}% da meta de proteína', { v1: Math.round(pct) })}>
          <div className="water-hero__inner">
            <span className="water-hero__value">{fmt(protein)}<small>g</small></span>
            <span className="water-hero__goal">{goalG ? t('de {g} g', { g: fmt(goalG) }) : t('sem meta')}</span>
          </div>
        </div>
        <div className="water-hero__info">
          <span className="water-hero__kicker">{t('Proteína hoje')}</span>
          <strong className="water-hero__status">
            {!goalG ? t('Defina sua meta') : done ? t('Meta batida! 🎉') : t('Faltam {g} g', { g: fmt(remaining) })}
          </strong>
          <span className="water-hero__hint">
            {goalG
              ? t('{v1}% da meta do dia', { v1: Math.round(pct) })
              : t('Preencha seus dados em Perfil › Meu corpo')}
          </span>
        </div>
      </div>

      <div className="water-quick quick-foods">
        {shownFoods.map(f => (
          <div key={f.id} className="quick-foods__cell">
            <button type="button" className="water-quick__btn" onClick={() => handleAdd(f)}>
              <span className="water-quick__icon" aria-hidden="true">{f.icon}</span>
              <span className="water-quick__ml">+{f.g}g</span>
              <span className="water-quick__label">{f.label}</span>
              <span className="quick-foods__kcal">{f.kcal} kcal</span>
            </button>
            {manage && f.custom && (
              <button type="button" className="quick-foods__del" aria-label={t('Apagar o atalho "{name}"', { name: f.label })} onClick={() => handleDeleteFood(f)}>×</button>
            )}
          </div>
        ))}
      </div>
      {(allFoods.length > VISIBLE_FOODS || myFoods.length > 0) && (
        <div className="water-actions">
          {allFoods.length > VISIBLE_FOODS && !manage ? (
            <button type="button" className="link-btn" onClick={() => setShowAllFoods(v => !v)}>
              {showAllFoods ? t('Ver menos') : t('Ver todos ({n})', { n: allFoods.length })}
            </button>
          ) : <span />}
          {myFoods.length > 0 && (
            <button type="button" className="link-btn" onClick={() => setManage(v => !v)}>
              {manage ? t('Concluir') : t('Gerenciar meus atalhos')}
            </button>
          )}
        </div>
      )}

      <div className="water-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCustomOpen(o => !o)} aria-expanded={customOpen}>
          {customOpen ? t('Fechar') : t('+ Outro alimento')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!hasLog} onClick={handleUndo}>
          ↶ {undoFood ? t('Desfazer {label}', { label: undoFood.label || `+${undoFood.g}g` }) : '−10g'}
        </button>
        <button type="button" className="link-btn water-actions__reset" disabled={!hasLog} onClick={handleReset}>
          {t('Zerar o dia')}
        </button>
      </div>
      {customOpen && (
        <form className="custom-food" onSubmit={handleCustomSubmit}>
          {[['kcal', t('Calorias')], ['g', t('Proteína (g)')], ['carbs', t('Carbo (g)')], ['fat', t('Gordura (g)')]].map(([k, label]) => (
            <label key={k}>
              {label}
              <input type="number" inputMode="numeric" min="0" max="5000" value={custom[k]} onChange={e => setCustom(c => ({ ...c, [k]: e.target.value }))} />
            </label>
          ))}
          <label className="custom-food__name">
            {t('Nome (para salvar como atalho)')}
            <input type="text" maxLength={30} value={custom.name} onChange={e => setCustom(c => ({ ...c, name: e.target.value }))} />
          </label>
          <label className="custom-food__save">
            <input type="checkbox" checked={saveShortcut} disabled={myFoods.length >= MAX_CUSTOM_FOODS} onChange={e => setSaveShortcut(e.target.checked)} />
            {myFoods.length >= MAX_CUSTOM_FOODS ? t('Limite de {n} atalhos atingido', { n: MAX_CUSTOM_FOODS }) : t('Salvar como atalho')}
          </label>
          <button type="submit" className="btn btn--sm custom-food__submit">{t('Adicionar')}</button>
        </form>
      )}

      {goalG > 0 && (
        <div className="history-stats water-stats">
          <div className="stat-card">
            <span className="stat-card__value">{stats.avg7 ? fmt(stats.avg7) : '–'}</span>
            <span className="stat-card__label">{t('Média 7 dias (g)')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.streak}</span>
            <span className="stat-card__label">{t('Dias seguidos na meta')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.daysHit}/{HISTORY_DAYS}</span>
            <span className="stat-card__label">{t('Dias na meta')}</span>
          </div>
        </div>
      )}

      <div className="section-group">
        <div className="section-group__label">{t('Calorias e macros de hoje')}</div>
        <div className="dash-card">
          {goals ? <MacroBars totals={totals} goals={goals} /> : <ProfileNutritionSection goals={goals} />}
        </div>
      </div>

      {goalG > 0 && (
        <div className="section-group">
          <div className="section-group__label">{t('Últimos {HISTORY_DAYS} dias', { HISTORY_DAYS })}</div>
          <div className="dash-card">
            {loading ? <Skeleton height={150} /> : <ProteinBars series={series} goalG={goalG} />}
            <p className="dash-card__subtitle">
              {t('Meta de {g} g por dia · melhor dia: {best} · ajuste a meta em Perfil', { g: fmt(goalG), best: stats.bestG ? `${fmt(stats.bestG)} g` : '–' })}
            </p>
          </div>
        </div>
      )}

      <div className="section-group">
        <div className="section-group__label">{t('Fontes de proteína')}</div>
        <div className="dash-card">
          <ul className="protein-sources">
            {PROTEIN_SOURCES.map(s => (
              <li key={s.name} className="protein-sources__item">
                <span className="protein-sources__icon" aria-hidden="true">{s.icon}</span>
                <span className="protein-sources__name">{s.name}<small>{s.portion}</small></span>
                <strong>{s.g} g</strong>
              </li>
            ))}
          </ul>
          <p className="dash-card__subtitle">{t('Valores aproximados por porção. Não substituem orientação de nutricionista.')}</p>
        </div>
      </div>
    </section>
  );
}
