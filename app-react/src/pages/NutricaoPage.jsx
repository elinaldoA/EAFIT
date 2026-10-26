import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { PROTEIN_SOURCES, PROTEIN_QUICK_ADD } from '../data/proteinSources';
import { useToast } from '../context/useToast';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { fetchProteinLog, upsertProteinLog, fetchProteinLogsRange, proteinStorageKey } from '../lib/proteinLog';
import { enqueue } from '../lib/syncQueue';
import { parseLocalDate, toDateStr } from '../lib/utils';
import { buildProteinSeries, proteinStats } from '../lib/proteinStats';
import { computeNutritionGoals } from '../lib/nutritionGoals';
import ProteinBars from '../components/ProteinBars';
import ProfileNutritionSection from '../components/ProfileNutritionSection';
import Skeleton from '../components/Skeleton';

import { t, locale } from '../lib/i18n';
const HISTORY_DAYS = 14;

function getProteinG() {
  return parseInt(localStorage.getItem(proteinStorageKey()), 10) || 0;
}

const fmt = n => n.toLocaleString(locale);

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
  // por engano. Vazia (app reaberto), o botão vira um -10 g de correção.
  const [undoStack, setUndoStack] = useState([]);

  const protein = getProteinG();

  useEffect(() => {
    if (!active || !user) return;

    async function load() {
      setLoading(true);
      try {
        const since = parseLocalDate(todayDate());
        since.setDate(since.getDate() - (HISTORY_DAYS - 1));
        const [todayG, history] = await Promise.all([
          fetchProteinLog(user.id, todayDate()),
          fetchProteinLogsRange(user.id, toDateStr(since)),
        ]);
        if (todayG !== null) localStorage.setItem(proteinStorageKey(), todayG);
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

  function saveProtein(next) {
    localStorage.setItem(proteinStorageKey(), next);
    bump();
    if (user) {
      upsertProteinLog(user.id, todayDate(), next).catch(err => {
        console.error('upsertProteinLog:', err);
        enqueue('protein_log', { userId: user.id, date: todayDate(), amountG: next });
        markPending();
      });
    }
  }

  function handleAdd(deltaG) {
    const next = Math.max(0, protein + deltaG);
    if (deltaG > 0) {
      setUndoStack(s => [...s, deltaG].slice(-10));
      if (goalG && next >= goalG && protein < goalG) toast(t('🎉 Meta de proteína do dia atingida!'));
    }
    saveProtein(next);
  }

  function handleUndo() {
    const last = undoStack[undoStack.length - 1] ?? 10;
    setUndoStack(s => s.slice(0, -1));
    saveProtein(Math.max(0, protein - last));
  }

  function handleReset() {
    if (!window.confirm(t('Zerar a proteína registrada hoje?'))) return;
    setUndoStack([]);
    saveProtein(0);
  }

  const pct = goalG ? Math.min(100, (protein / goalG) * 100) : 0;
  const remaining = Math.max(0, goalG - protein);
  const done = !!goalG && protein >= goalG;
  const undoAmount = undoStack[undoStack.length - 1];

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

      <div className="water-quick">
        {PROTEIN_QUICK_ADD.map(q => (
          <button key={q.g} type="button" className="water-quick__btn" onClick={() => handleAdd(q.g)}>
            <span className="water-quick__icon" aria-hidden="true">{q.icon}</span>
            <span className="water-quick__ml">+{q.g}g</span>
            <span className="water-quick__label">{q.label}</span>
          </button>
        ))}
      </div>

      <div className="water-actions">
        <button type="button" className="btn btn--ghost btn--sm" disabled={protein === 0} onClick={handleUndo}>
          ↶ {undoAmount ? t('Desfazer +{undoAmount}g', { undoAmount }) : '−10g'}
        </button>
        <button type="button" className="link-btn water-actions__reset" disabled={protein === 0} onClick={handleReset}>
          {t('Zerar o dia')}
        </button>
      </div>

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
        <div className="section-group__label">{t('Suas metas diárias')}</div>
        <div className="dash-card">
          <ProfileNutritionSection goals={goals} />
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
