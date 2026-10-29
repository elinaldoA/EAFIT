import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { PROTEIN_SOURCES, QUICK_FOODS } from '../data/proteinSources';
import { useToast } from '../context/useToast';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { fetchNutritionLog, upsertNutritionLog, fetchProteinLogsRange, readLocalTotals, writeLocalTotals } from '../lib/proteinLog';
import { applyFood, EMPTY_TOTALS } from '../lib/nutritionTotals';
import { enqueue } from '../lib/syncQueue';
import { parseLocalDate, toDateStr, fmtDate } from '../lib/utils';
import { buildProteinSeries, proteinStats } from '../lib/proteinStats';
import { fetchWeightLogs } from '../lib/weightLog';
import { buildNutritionSeries, kcalWeekSummary, weightRatePerWeek, nutritionReading } from '../lib/nutritionInsights';
import { computeNutritionGoals } from '../lib/nutritionGoals';
import { fetchCustomFoods, createCustomFood, updateCustomFood, deleteCustomFood, readCachedFoods } from '../lib/nutritionFoods';
import { sortByUse, bumpUseCount, readUseCounts, MAX_CUSTOM_FOODS } from '../lib/foodShortcuts';
import { MEALS, mealForHour, readCachedEntries, fetchEntries, fetchEntriesRange, addEntry, updateEntry, removeEntry } from '../lib/nutritionEntries';
import { dayPace, suggestFoods, portionFood, mealHabit, proteinSpread, suggestedKcal } from '../lib/nutritionCoach';
import FoodSearch from '../components/FoodSearch';
import MealLog from '../components/MealLog';
import ProteinBars from '../components/ProteinBars';
import MacroBars from '../components/MacroBars';
import NutritionCoach from '../components/NutritionCoach';
import ProfileNutritionSection from '../components/ProfileNutritionSection';
import Skeleton from '../components/Skeleton';

import { t, locale } from '../lib/i18n';
const HISTORY_DAYS = 14;
const SPREAD_FROM_HOUR = 19;
// Duas fileiras de atalhos; o resto fica em "Ver todos".
const VISIBLE_FOODS = 8;

const fmt = n => n.toLocaleString(locale);
const READING_TEXT = {
  few_days: () => t('Registre as calorias por pelo menos 3 dias para ver a leitura da semana.'),
  on_track: () => t('Você está dentro da meta de calorias. Continue assim.'),
  plateau: () => t('Calorias na meta, mas o peso não está indo na direção do seu objetivo. Se continuar assim por 2 a 3 semanas, ajuste as calorias em 5 a 10%.'),
  below_gain: () => t('Você está abaixo da meta de calorias. Para ganhar massa, coma um pouco mais.'),
  below_loss: () => t('Você está bem abaixo da meta de calorias. Um déficit grande demais pode custar músculo e energia nos treinos.'),
  below: () => t('Você está abaixo da meta de calorias da semana.'),
  above_loss: () => t('Você está acima da meta de calorias, o que atrasa a perda de peso.'),
  above_gain: () => t('Você está acima da meta de calorias. Um excesso grande vira mais gordura do que massa.'),
  above: () => t('Você está acima da meta de calorias da semana.'),
};
const EMPTY_CUSTOM = { name: '', g: '', kcal: '', carbs: '', fat: '' };
const MEAL_NAME = {
  cafe: () => t('Café da manhã'),
  almoco: () => t('Almoço'),
  lanche: () => t('Lanche'),
  jantar: () => t('Jantar'),
  outro: () => t('Outros'),
};
const EMPTY_FIX = { g: '', kcal: '', carbs: '', fat: '' };

// O "Desfazer" sobrevive a fechar o app: a pilha do dia fica no aparelho.
const undoKey = () => `nutricaoUndo_${todayDate()}`;
function readUndo() {
  try { return JSON.parse(localStorage.getItem(undoKey())) || []; } catch { return []; }
}
function writeUndo(stack) {
  try { localStorage.setItem(undoKey(), JSON.stringify(stack)); } catch { /* sem cota: só perde o desfazer */ }
}

export default function NutricaoPage({ active }) {
  const { user } = useAuth();
  const { markPending } = useWorkout();
  const toast = useToast();
  const goals = useMemo(() => computeNutritionGoals(user?.user_metadata), [user]);
  const goalG = goals?.protein ?? 0;

  const [_tick, setTick] = useState(0);
  const bump = () => setTick(n => n + 1);
  const [logs, setLogs] = useState([]);
  const [weightLogs, setWeightLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  // Últimas adições do dia, pra "Desfazer" tirar exatamente o que entrou por
  // engano. Vazia (dia sem adições guardadas), o botão vira um -10 g de proteína.
  const [undoStack, setUndoStack] = useState(readUndo);
  const [editingId, setEditingId] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entries, setEntries] = useState(() => readCachedEntries(todayDate()));
  // Diário dos últimos dias, para o assistente achar a refeição de sempre.
  const [pastEntries, setPastEntries] = useState([]);
  const [meal, setMeal] = useState(() => mealForHour(new Date().getHours()));
  const [searchOpen, setSearchOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixDate, setFixDate] = useState('');
  const [fix, setFix] = useState(EMPTY_FIX);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState(EMPTY_CUSTOM);
  const [saveShortcut, setSaveShortcut] = useState(false);
  const [myFoods, setMyFoods] = useState(() => (user ? readCachedFoods(user.id) : []));
  const [useCounts, setUseCounts] = useState(readUseCounts);
  const [showAllFoods, setShowAllFoods] = useState(false);
  const [manage, setManage] = useState(false);
  const [coachPick, setCoachPick] = useState(0);
  const [chart, setChart] = useState('kcal');

  const totals = readLocalTotals();
  const protein = totals.protein;

  // Refaz a ordem dos atalhos só ao abrir a aba.
  useEffect(() => {
    if (active) setUseCounts(readUseCounts());
  }, [active]);

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
    fetchWeightLogs(user.id).then(setWeightLogs).catch(err => console.error('fetchWeightLogs:', err));
    fetchEntries(user.id, todayDate()).then(setEntries).catch(err => console.error('fetchEntries:', err));
    const habitSince = parseLocalDate(todayDate());
    habitSince.setDate(habitSince.getDate() - HISTORY_DAYS);
    fetchEntriesRange(user.id, toDateStr(habitSince)).then(setPastEntries).catch(err => console.error('fetchEntriesRange:', err));
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

  const nSeries = useMemo(() => {
    const s = buildNutritionSeries(logs, todayDate(), HISTORY_DAYS);
    s[s.length - 1] = { ...s[s.length - 1], ...totals };
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, totals.protein, totals.kcal, totals.carbs, totals.fat]);
  const kcalGoal = goals?.kcal ?? 0;
  const week = useMemo(() => kcalWeekSummary(nSeries, kcalGoal), [nSeries, kcalGoal]);
  const weightRate = useMemo(() => weightRatePerWeek(weightLogs, todayDate()), [weightLogs]);
  const reading = nutritionReading(week, user?.user_metadata?.meta, weightRate);
  const kcalSeries = useMemo(() => nSeries.map(d => ({ date: d.date, g: d.kcal })), [nSeries]);

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

  // Vários de uma vez (a refeição de sempre) somam sobre o mesmo total, num
  // só salvamento; cada um vira um registro e um passo do "Desfazer".
  function handleAddMany(foods) {
    let next = totals;
    const added = [];
    for (const food of foods) {
      // Só grava a contagem: a ordem dos botões é refeita ao abrir a aba, para
      // o alimento não sair de debaixo do dedo a cada toque.
      if (food.id) bumpUseCount(food.id);
      next = applyFood(next, food);
      const entryId = crypto.randomUUID();
      if (user) addEntry(user.id, todayDate(), { icon: food.icon, label: food.label || t('Alimento'), g: food.g, kcal: food.kcal, carbs: food.carbs, fat: food.fat }, meal, entryId);
      added.push({ ...food, entryId });
    }
    if (user) setEntries(readCachedEntries(todayDate()));
    setUndoStack(s => { const n = [...s, ...added].slice(-10); writeUndo(n); return n; });
    if (goalG && next.protein >= goalG && protein < goalG) toast(t('🎉 Meta de proteína do dia atingida!'));
    saveTotals(next);
  }
  const handleAdd = food => handleAddMany([food]);

  function handleUndo() {
    const last = undoStack[undoStack.length - 1];
    if (last?.entryId && user) {
      removeEntry(user.id, todayDate(), last.entryId);
      setEntries(readCachedEntries(todayDate()));
    }
    setUndoStack(s => { const n = s.slice(0, -1); writeUndo(n); return n; });
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
    if (editingEntry) {
      const old = entries.find(x => x.id === editingEntry);
      if (old && user) {
        const patch = { label: name || old.label, ...food };
        updateEntry(user.id, todayDate(), old.id, patch);
        setEntries(readCachedEntries(todayDate()));
        saveTotals(applyFood(applyFood(totals, old, -1), patch, 1));
        setUndoStack(s => { const n = s.filter(x => x.entryId !== old.id); writeUndo(n); return n; });
        toast(t('Registro atualizado'));
      }
      closeForm();
      return;
    }
    if (editingId) {
      if (!name) { toast(t('Dê um nome ao atalho')); return; }
      setMyFoods(await updateCustomFood(user.id, editingId, { ...food, name }));
      toast(t('Atalho atualizado'));
      closeForm();
      return;
    }
    let saved = null;
    if (saveShortcut && user) {
      try {
        const before = new Set(myFoods.map(f => f.id));
        const list = await createCustomFood(user.id, { ...food, name });
        setMyFoods(list);
        saved = list.find(f => !before.has(f.id)) || null;
        toast(t('Atalho salvo'));
      } catch (err) {
        console.error('createCustomFood:', err);
        toast(t('⚠️ Não foi possível salvar o atalho'));
      }
    }
    handleAdd(saved || { ...food, label: name || undefined });
    closeForm();
  }

  function closeForm() {
    setCustom(EMPTY_CUSTOM);
    setSaveShortcut(false);
    setEditingId(null);
    setEditingEntry(null);
    setCustomOpen(false);
  }

  function handleEditEntry(e) {
    setCustom({ name: e.label, g: String(e.g), kcal: String(e.kcal), carbs: String(e.carbs), fat: String(e.fat) });
    setEditingEntry(e.id);
    setEditingId(null);
    setSaveShortcut(false);
    setCustomOpen(true);
  }

  function handleDeleteEntry(e) {
    if (!window.confirm(t('Remover "{name}" do dia?', { name: e.label }))) return;
    if (user) removeEntry(user.id, todayDate(), e.id);
    setEntries(readCachedEntries(todayDate()));
    saveTotals(applyFood(totals, e, -1));
    setUndoStack(s => { const n = s.filter(x => x.entryId !== e.id); writeUndo(n); return n; });
  }

  function handleEditFood(food) {
    setCustom({ name: food.label, g: String(food.g), kcal: String(food.kcal), carbs: String(food.carbs), fat: String(food.fat) });
    setEditingId(food.id);
    setSaveShortcut(true);
    setCustomOpen(true);
  }

  // Dias anteriores (menos hoje): corrige o que foi registrado errado ou esquecido.
  const pastDays = useMemo(() => {
    const out = [todayDate()];
    const d = parseLocalDate(todayDate());
    for (let i = 1; i < HISTORY_DAYS; i++) {
      d.setDate(d.getDate() - 1);
      out.push(toDateStr(d));
    }
    return out;
  }, []);

  function pickFixDate(date) {
    setFixDate(date);
    const row = date === todayDate()
      ? { amount_g: totals.protein, kcal: totals.kcal, carbs_g: totals.carbs, fat_g: totals.fat }
      : logs.find(l => l.log_date === date);
    setFix(row
      ? { g: String(row.amount_g ?? ''), kcal: String(row.kcal ?? ''), carbs: String(row.carbs_g ?? ''), fat: String(row.fat_g ?? '') }
      : EMPTY_FIX);
  }

  function handleFixSubmit(e) {
    e.preventDefault();
    if (!fixDate || !user) return;
    const totals = {
      protein: parseInt(fix.g, 10) || 0,
      kcal: parseInt(fix.kcal, 10) || 0,
      carbs: parseInt(fix.carbs, 10) || 0,
      fat: parseInt(fix.fat, 10) || 0,
    };
    if (fixDate === todayDate()) {
      saveTotals(totals);
      setUndoStack([]);
      writeUndo([]);
      toast(t('Dia corrigido'));
      setFixOpen(false);
      setFixDate('');
      setFix(EMPTY_FIX);
      return;
    }
    upsertNutritionLog(user.id, fixDate, totals).catch(err => {
      console.error('upsertNutritionLog:', err);
      enqueue('nutrition_log', { userId: user.id, date: fixDate, totals });
      markPending();
    });
    const row = { log_date: fixDate, amount_g: totals.protein, kcal: totals.kcal, carbs_g: totals.carbs, fat_g: totals.fat };
    setLogs(ls => [...ls.filter(l => l.log_date !== fixDate), row].sort((a, b) => a.log_date.localeCompare(b.log_date)));
    toast(t('Dia corrigido'));
    setFixOpen(false);
    setFixDate('');
    setFix(EMPTY_FIX);
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
    writeUndo([]);
    if (user) entries.forEach(e => removeEntry(user.id, todayDate(), e.id));
    setEntries([]);
    saveTotals(EMPTY_TOTALS);
  }

  const pct = goalG ? Math.min(100, (protein / goalG) * 100) : 0;
  const remaining = Math.max(0, goalG - protein);
  const done = !!goalG && protein >= goalG;
  const allFoods = useMemo(() => sortByUse([...QUICK_FOODS, ...myFoods], useCounts), [myFoods, useCounts]);
  const shownFoods = showAllFoods || manage ? allFoods : allFoods.slice(0, VISIBLE_FOODS);
  const undoFood = undoStack[undoStack.length - 1];
  // O que está nos totais mas sem detalhe (registros de antes do diário ou ajuste manual).
  const rest = (() => {
    const sum = k => entries.reduce((s, e) => s + (e[k] || 0), 0);
    const kcal = Math.max(0, totals.kcal - sum('kcal'));
    const prot = Math.max(0, totals.protein - sum('g'));
    return kcal || prot ? { kcal, protein: prot } : null;
  })();
  const hasLog = totals.protein + totals.kcal + totals.carbs + totals.fat > 0;
  const now = new Date();
  const pace = dayPace(totals, goals, now.getHours() + now.getMinutes() / 60);
  const suggestions = pace && pace.status !== 'done' ? suggestFoods(allFoods, pace.left) : [];
  const habit = useMemo(() => mealHabit(pastEntries, meal, todayDate(), entries), [pastEntries, meal, entries]);
  // Só no fim do dia: antes disso as outras refeições ainda nem chegaram.
  const spread = now.getHours() >= SPREAD_FROM_HOUR ? proteinSpread(entries) : null;
  const newKcal = suggestedKcal(kcalGoal, reading, user?.user_metadata?.meta);
  // Uma ação só: a refeição de sempre vem antes (é o que a pessoa ia comer);
  // "Outra opção" passa pelas sugestões que fecham a proteína.
  const actions = [
    ...(habit ? [{ kind: habit.kind, date: habit.date, label: habit.items.map(i => i.label).join(' + '), foods: habit.items }] : []),
    ...suggestions.map(s => ({ kind: 'suggest', label: portionFood(s).label, foods: [portionFood(s)] })),
  ];
  const action = actions.length ? actions[coachPick % actions.length] : null;

  return (
    <section id="page-nutricao" className="page active">
      <div className="nutri-top">
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
              {!goalG
                ? t('Preencha seus dados em Perfil › Meu corpo')
                : stats.streak >= 2
                  ? t('🔥 {n} dias seguidos na meta', { n: stats.streak })
                  : t('{v1}% da meta do dia', { v1: Math.round(pct) })}
            </span>
          </div>
        </div>
        {goals ? <MacroBars totals={totals} goals={goals} compact /> : <ProfileNutritionSection goals={goals} />}
      </div>

      <NutritionCoach
        pace={pace} action={action} meal={meal} spread={spread}
        hasMore={actions.length > 1} onNext={() => setCoachPick(i => i + 1)} onAdd={handleAddMany}
      />

      <div className="section-group">
        <div className="section-group__label">{t('Adicionar ao dia')}</div>
        <div className="water-actions meal-pick">
          <label>
            {t('Refeição')}
            <select value={meal} onChange={e => { setMeal(e.target.value); setCoachPick(0); }}>
              {MEALS.map(m => <option key={m} value={m}>{MEAL_NAME[m]()}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSearchOpen(o => !o)} aria-expanded={searchOpen}>
            {searchOpen ? t('Fechar busca') : t('🔎 Buscar alimento')}
          </button>
        </div>
        {searchOpen && <FoodSearch onAdd={handleAdd} />}

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
                <button type="button" className="quick-foods__edit" aria-label={t('Editar o atalho "{name}"', { name: f.label })} onClick={() => handleEditFood(f)}>✎</button>
              )}
              {manage && f.custom && (
                <button type="button" className="quick-foods__del" aria-label={t('Apagar o atalho "{name}"', { name: f.label })} onClick={() => handleDeleteFood(f)}>×</button>
              )}
            </div>
          ))}
        </div>

        <div className="water-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => (customOpen ? closeForm() : setCustomOpen(true))} aria-expanded={customOpen}>
            {customOpen ? t('Fechar') : t('+ Outro alimento')}
          </button>
          {undoFood && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleUndo}>
              ↶ {t('Desfazer {label}', { label: undoFood.label || `+${undoFood.g}g` })}
            </button>
          )}
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
            {editingEntry ? (
              <p className="custom-food__save">{t('Editando o registro. Os totais do dia acompanham.')}</p>
            ) : editingId ? (
              <p className="custom-food__save">{t('Editando o atalho. O dia de hoje não muda.')}</p>
            ) : (
              <label className="custom-food__save">
                <input type="checkbox" checked={saveShortcut} disabled={myFoods.length >= MAX_CUSTOM_FOODS} onChange={e => setSaveShortcut(e.target.checked)} />
                {myFoods.length >= MAX_CUSTOM_FOODS ? t('Limite de {n} atalhos atingido', { n: MAX_CUSTOM_FOODS }) : t('Salvar como atalho')}
              </label>
            )}
            <button type="submit" className="btn btn--sm custom-food__submit">{editingEntry || editingId ? t('Salvar') : t('Adicionar')}</button>
          </form>
        )}
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
      </div>

      <div className="section-group">
        <div className="section-group__label">{t('Diário de hoje')}</div>
        <div className="dash-card">
          <MealLog entries={entries} rest={rest} onEdit={handleEditEntry} onDelete={handleDeleteEntry} />
          <div className="nutri-day-tools">
            <button type="button" className="link-btn" onClick={() => setFixOpen(o => !o)} aria-expanded={fixOpen}>
              {fixOpen ? t('Fechar') : t('Corrigir os totais de um dia')}
            </button>
            {hasLog && (
              <button type="button" className="link-btn water-actions__reset" onClick={handleReset}>{t('Zerar o dia')}</button>
            )}
          </div>
          {fixOpen && (
            <form className="custom-food" onSubmit={handleFixSubmit}>
              <label className="custom-food__name">
                {t('Dia')}
                <select value={fixDate} onChange={e => pickFixDate(e.target.value)}>
                  <option value="">{t('Escolha o dia')}</option>
                  {pastDays.map(d => <option key={d} value={d}>{d === todayDate() ? t('Hoje') : fmtDate(d)}</option>)}
                </select>
              </label>
              {[['kcal', t('Calorias')], ['g', t('Proteína (g)')], ['carbs', t('Carbo (g)')], ['fat', t('Gordura (g)')]].map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input type="number" inputMode="numeric" min="0" max="5000" value={fix[k]} onChange={e => setFix(c => ({ ...c, [k]: e.target.value }))} />
                </label>
              ))}
              <button type="submit" className="btn btn--sm custom-food__submit" disabled={!fixDate}>{t('Salvar o dia')}</button>
            </form>
          )}
        </div>
      </div>

      {goals && (
        <div className="section-group">
          <div className="section-group__label">{t('Sua semana')}</div>
          <div className="dash-card">
            {/* Com ajuste calculado, a leitura do platô vira a própria ação. */}
            {newKcal ? (
              <p className="nutri-reading">
                {t('O peso não está indo na direção do seu objetivo. Passe para cerca de {kcal} kcal por dia nas próximas 2 semanas (hoje: {goal}).', { kcal: fmt(newKcal), goal: fmt(kcalGoal) })}
              </p>
            ) : reading && <p className="nutri-reading">{READING_TEXT[reading]()}</p>}
            <div className="history-stats water-stats">
              <div className="stat-card">
                <span className="stat-card__value">{week.avgKcal ? fmt(week.avgKcal) : '–'}</span>
                <span className="stat-card__label">{t('Média kcal/dia')}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__value">{stats.avg7 ? fmt(stats.avg7) : '–'}</span>
                <span className="stat-card__label">{t('Proteína/dia (g)')}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__value">{weightRate === null ? '–' : `${weightRate > 0 ? '+' : ''}${weightRate.toLocaleString(locale)}`}</span>
                <span className="stat-card__label">{t('kg por semana')}</span>
              </div>
            </div>
            <div className="seg" role="tablist" aria-label={t('Últimos {HISTORY_DAYS} dias', { HISTORY_DAYS })}>
              {[['kcal', t('Calorias')], ['protein', t('Proteína')]].map(([k, label]) => (
                <button
                  key={k} type="button" role="tab" aria-selected={chart === k}
                  className={`seg__btn${chart === k ? ' seg__btn--active' : ''}`}
                  onClick={() => setChart(k)}
                >{label}</button>
              ))}
            </div>
            {loading ? <Skeleton height={150} /> : chart === 'kcal'
              ? <ProteinBars series={kcalSeries} goalG={kcalGoal} unit="kcal" ariaLabel={t('Calorias nos últimos {HISTORY_DAYS} dias', { HISTORY_DAYS })} />
              : <ProteinBars series={series} goalG={goalG} />}
          </div>
        </div>
      )}

      <details className="nutri-ref">
        <summary>{t('Fontes de proteína')}</summary>
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
      </details>
    </section>
  );
}
