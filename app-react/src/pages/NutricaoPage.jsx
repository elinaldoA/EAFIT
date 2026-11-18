import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { QUICK_FOODS } from '../data/proteinSources';
import { useToast } from '../context/useToast';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { fetchNutritionLog, upsertNutritionLog, fetchProteinLogsRange, readLocalTotals, writeLocalTotals } from '../lib/proteinLog';
import { applyFood, EMPTY_TOTALS } from '../lib/nutritionTotals';
import { enqueue } from '../lib/syncQueue';
import { parseLocalDate, toDateStr } from '../lib/utils';
import { buildProteinSeries, proteinStats } from '../lib/proteinStats';
import { fetchWeightLogs } from '../lib/weightLog';
import { buildNutritionSeries, kcalWeekSummary, weightRatePerWeek, nutritionReading, estimateTdee } from '../lib/nutritionInsights';
import { computeNutritionGoals, goalKcalFactor, MIN_KCAL, nutritionProfile } from '../lib/nutritionGoals';
import { fetchCustomFoods, createCustomFood, updateCustomFood, deleteCustomFood, restoreCustomFood, readCachedFoods } from '../lib/nutritionFoods';
import { sortByUse, bumpUseCount, readUseCounts, MAX_CUSTOM_FOODS } from '../lib/foodShortcuts';
import { MEALS, mealForHour, readCachedEntries, fetchEntries, fetchEntriesRange, addEntry, updateEntry, removeEntry } from '../lib/nutritionEntries';
import { dayPace, mealHabit, proteinSpread, suggestedKcal, suggestFoods, portionFood } from '../lib/nutritionCoach';
import FoodSearch from '../components/FoodSearch';
import MealLog from '../components/MealLog';
import NutritionDayCard from '../components/NutritionDayCard';
import DietPlan from '../components/DietPlan';
import { fetchPlan, savePlan, readCachedPlan } from '../lib/nutritionPlan';
import GoalMeals from '../components/GoalMeals';
import ProfileNutritionSection from '../components/ProfileNutritionSection';
import NutritionWeek from '../components/NutritionWeek';
import DayFixForm from '../components/DayFixForm';
import ProteinSources from '../components/ProteinSources';
import FreeTextMeal from '../components/FreeTextMeal';
import { foodsWithCatalog } from '../data/foodDatabase';
import { readCachedCatalog, fetchFoodCatalog } from '../lib/foodCatalog';
import { recentFoods, usedNames, yesterdayMeal } from '../lib/recentFoods';
import { HISTORY_DAYS, unloggedRest, dayMicros } from '../lib/nutritionDay';

import { t, locale } from '../lib/i18n';
const SPREAD_FROM_HOUR = 19;
// Diário buscado para os "alimentos de sempre" (o hábito da refeição olha só os últimos 14 dias).
const RECENT_DAYS = 60;
const CLOSE_FROM_HOUR = 16;
const CLOSE_MIN_PROTEIN = 10;
// Duas fileiras de atalhos; o resto fica em "Ver todos".
const VISIBLE_FOODS = 4;

const fmt = n => n.toLocaleString(locale);
const EMPTY_CUSTOM = { name: '', g: '', kcal: '', carbs: '', fat: '' };
const MEAL_NAME = {
  cafe: () => t('Café da manhã'),
  almoco: () => t('Almoço'),
  lanche: () => t('Lanche'),
  jantar: () => t('Jantar'),
  ceia: () => t('Ceia'),
  outro: () => t('Outros'),
};

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
  const profile = useMemo(() => nutritionProfile(user?.user_metadata), [user]);
  const goals = useMemo(() => computeNutritionGoals(profile), [profile]);
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
  const [textOpen, setTextOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState(EMPTY_CUSTOM);
  const [saveShortcut, setSaveShortcut] = useState(false);
  const [myFoods, setMyFoods] = useState(() => (user ? readCachedFoods(user.id) : []));
  const [useCounts, setUseCounts] = useState(readUseCounts);
  const [showAllFoods, setShowAllFoods] = useState(false);
  const [manage, setManage] = useState(false);
  const [catalog, setCatalog] = useState(readCachedCatalog);
  const [plan, setPlan] = useState(() => (user ? readCachedPlan(user.id) : []));

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
    habitSince.setDate(habitSince.getDate() - RECENT_DAYS);
    fetchEntriesRange(user.id, toDateStr(habitSince)).then(setPastEntries).catch(err => console.error('fetchEntriesRange:', err));
    fetchPlan(user.id).then(setPlan).catch(err => console.error('fetchPlan:', err));
    fetchFoodCatalog().then(setCatalog).catch(err => console.warn('fetchFoodCatalog:', err));
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
  const reading = nutritionReading(week, profile.meta, weightRate);
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
  function handleAddMany(foods, mealKey = meal) {
    let next = totals;
    const added = [];
    for (const food of foods) {
      // Só grava a contagem: a ordem dos botões é refeita ao abrir a aba, para
      // o alimento não sair de debaixo do dedo a cada toque.
      if (food.id) bumpUseCount(food.id);
      next = applyFood(next, food);
      const entryId = crypto.randomUUID();
      if (user) addEntry(user.id, todayDate(), { icon: food.icon, label: food.label || t('Alimento'), g: food.g, kcal: food.kcal, carbs: food.carbs, fat: food.fat, fiber: food.fiber, sodium: food.sodium, sugar: food.sugar, satFat: food.satFat }, mealKey, entryId);
      added.push({ ...food, entryId });
    }
    if (user) setEntries(readCachedEntries(todayDate()));
    setUndoStack(s => { const n = [...s, ...added].slice(-10); writeUndo(n); return n; });
    if (goalG && next.protein >= goalG && protein < goalG) toast(t('🎉 Meta de proteína do dia atingida!'));
    saveTotals(next);
    return added;
  }
  const handleAdd = food => handleAddMany([food]);

  // Desfaz de uma vez o que um handleAddMany registrou (a refeição sugerida inteira).
  function handleRemoveMany(added) {
    if (!added?.length) return;
    const ids = new Set(added.map(f => f.entryId));
    if (user) {
      added.forEach(f => removeEntry(user.id, todayDate(), f.entryId));
      setEntries(readCachedEntries(todayDate()));
    }
    setUndoStack(s => { const n = s.filter(f => !ids.has(f.entryId)); writeUndo(n); return n; });
    saveTotals(added.reduce((acc, f) => applyFood(acc, f, -1), totals));
    toast(t('Refeição desfeita'));
  }

  async function handleSavePlan(meals) {
    if (!user) return;
    setPlan(await savePlan(user.id, meals));
    toast(t('Dieta salva'));
  }

  async function handleClearPlan() {
    const before = plan;
    setPlan(await savePlan(user.id, []));
    toast(t('Dieta importada removida'), 6000, {
      action: { label: t('Desfazer'), onClick: async () => setPlan(await savePlan(user.id, before)) },
    });
  }

  function handleRegisterPlanMeal(m) {
    handleAddMany(m.items, m.meal);
    toast(t('{meal} registrado', { meal: m.name }));
  }

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
    const date = todayDate();
    const inStack = undoStack.find(x => x.entryId === e.id);
    if (user) removeEntry(user.id, date, e.id);
    setEntries(readCachedEntries(date));
    saveTotals(applyFood(totals, e, -1));
    setUndoStack(s => { const n = s.filter(x => x.entryId !== e.id); writeUndo(n); return n; });
    toast(t('"{name}" removido', { name: e.label }), 6000, {
      action: {
        label: t('Desfazer'),
        onClick: () => {
          if (user) addEntry(user.id, date, e, e.meal, e.id);
          setEntries(user ? readCachedEntries(date) : s => [...s, e]);
          if (inStack) setUndoStack(s => { const n = [...s, inStack].slice(-10); writeUndo(n); return n; });
          saveTotals(applyFood(readLocalTotals(), e, 1));
        },
      },
    });
  }

  function handleEditFood(food) {
    setCustom({ name: food.label, g: String(food.g), kcal: String(food.kcal), carbs: String(food.carbs), fat: String(food.fat) });
    setEditingId(food.id);
    setSaveShortcut(true);
    setCustomOpen(true);
  }

  // Corrigir os totais de um dia (DayFixForm): hoje troca os totais e zera o
  // "Desfazer"; os outros dias vão direto para o histórico.
  function handleFixToday(totals) {
    saveTotals(totals);
    setUndoStack([]);
    writeUndo([]);
    toast(t('Dia corrigido'));
    setFixOpen(false);
  }

  function handleFixPast(date, totals) {
    upsertNutritionLog(user.id, date, totals).catch(err => {
      console.error('upsertNutritionLog:', err);
      enqueue('nutrition_log', { userId: user.id, date, totals });
      markPending();
    });
    const row = { log_date: date, amount_g: totals.protein, kcal: totals.kcal, carbs_g: totals.carbs, fat_g: totals.fat };
    setLogs(ls => [...ls.filter(l => l.log_date !== date), row].sort((a, b) => a.log_date.localeCompare(b.log_date)));
    toast(t('Dia corrigido'));
    setFixOpen(false);
  }

  async function handleDeleteFood(food) {
    try {
      setMyFoods(await deleteCustomFood(user.id, food.id));
      toast(t('Atalho "{name}" apagado', { name: food.label }), 6000, {
        action: {
          label: t('Desfazer'),
          onClick: async () => {
            try {
              setMyFoods(await restoreCustomFood(user.id, food));
            } catch (err) {
              console.error('restoreCustomFood:', err);
              toast(t('⚠️ Não foi possível salvar o atalho'));
            }
          },
        },
      });
    } catch (err) {
      console.error('deleteCustomFood:', err);
      toast(t('⚠️ Não foi possível apagar o atalho'));
    }
  }

  function handleReset() {
    const prev = { entries, totals, undo: undoStack, date: todayDate() };
    setUndoStack([]);
    writeUndo([]);
    if (user) prev.entries.forEach(e => removeEntry(user.id, prev.date, e.id));
    setEntries([]);
    saveTotals(EMPTY_TOTALS);
    toast(t('Dia zerado'), 6000, {
      action: {
        label: t('Desfazer'),
        onClick: () => {
          if (user && prev.date === todayDate()) {
            prev.entries.forEach(e => addEntry(user.id, prev.date, e, e.meal, e.id));
            setEntries(readCachedEntries(prev.date));
          } else setEntries(prev.entries);
          setUndoStack(prev.undo);
          writeUndo(prev.undo);
          saveTotals(prev.totals);
        },
      },
    });
  }

  const remaining = Math.max(0, goalG - protein);
  const done = !!goalG && protein >= goalG;
  const allFoods = useMemo(() => sortByUse([...QUICK_FOODS, ...myFoods], useCounts), [myFoods, useCounts]);
  const shownFoods = showAllFoods || manage ? allFoods : allFoods.slice(0, VISIBLE_FOODS);
  const undoFood = undoStack[undoStack.length - 1];
  // O que está nos totais mas sem detalhe (registros de antes do diário ou ajuste manual).
  const rest = unloggedRest(entries, totals);
  const hasLog = totals.protein + totals.kcal + totals.carbs + totals.fat > 0;
  const now = new Date();
  const pace = dayPace(totals, goals, now.getHours() + now.getMinutes() / 60);
  const foodList = useMemo(() => foodsWithCatalog(catalog), [catalog]);
  const recent = useMemo(() => recentFoods(pastEntries, entries, todayDate()), [pastEntries, entries]);
  const used = useMemo(() => usedNames(recent), [recent]);
  const yesterday = useMemo(() => {
    const d = parseLocalDate(todayDate());
    d.setDate(d.getDate() - 1);
    return toDateStr(d);
  }, []);
  const repeatItems = useMemo(() => yesterdayMeal(pastEntries, entries, meal, yesterday), [pastEntries, entries, meal, yesterday]);
  // Fim de tarde em diante, com proteína ainda faltando: o que fecha a meta com
  // poucas calorias (lib/nutritionCoach suggestFoods) entre os atalhos.
  const closeLeft = goals ? { protein: remaining, kcal: goals.kcal - totals.kcal } : null;
  const closing = useMemo(
    () => (closeLeft && now.getHours() >= CLOSE_FROM_HOUR && remaining >= CLOSE_MIN_PROTEIN ? suggestFoods(allFoods, closeLeft, 3) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFoods, remaining, totals.kcal, goals],
  );
  const habit = useMemo(() => mealHabit(pastEntries, meal, todayDate(), entries), [pastEntries, meal, entries]);
  // Só no fim do dia: antes disso as outras refeições ainda nem chegaram.
  const spread = now.getHours() >= SPREAD_FROM_HOUR ? proteinSpread(entries) : null;
  // Um aviso só no resumo do dia: fora do ritmo, depois a proteína concentrada
  // (fim do dia), depois a sequência na meta.
  const dayHint = (() => {
    if (pace?.status === 'over_kcal') return t('Você passou {kcal} kcal da meta. Se for comer de novo, só proteína magra.', { kcal: fmt(-pace.left.kcal) });
    if (pace?.status === 'behind') return t('{g} g de proteína atrás do ritmo para este horário.', { g: fmt(pace.behindG) });
    if (spread) return t('{share}% da proteína de hoje veio de uma refeição só ({meal}). Amanhã, divida melhor entre as refeições.', { share: spread.share, meal: MEAL_NAME[spread.meal]() });
    return stats.streak >= 2 ? t('🔥 {n} dias seguidos na meta', { n: stats.streak }) : null;
  })();
  const newKcal = suggestedKcal(kcalGoal, reading, profile.meta);
  // Gasto real pelo histórico (comida registrada + balança). A meta sugerida só
  // aparece quando foge 5% ou mais da meta da fórmula.
  const tdee = useMemo(() => estimateTdee(nSeries, weightRate), [nSeries, weightRate]);
  const tdeeKcal = tdee && goals
    ? Math.max(MIN_KCAL[profile.sexo] || 1200, Math.round((tdee * goalKcalFactor(profile.meta)) / 10) * 10)
    : null;
  const tdeeDiffers = !!tdeeKcal && Math.abs(tdeeKcal - kcalGoal) / kcalGoal >= 0.05;
  // Fibra e sódio do dia: só dos registros que trazem o dado.
  const micros = dayMicros(entries);

  return (
    <section id="page-nutricao" className="page active">
      {goals ? (
        <NutritionDayCard
          totals={totals} goals={goals} micros={micros}
          status={done ? t('Proteína batida! 🎉') : t('Faltam {g} g de proteína', { g: fmt(remaining) })}
          hint={dayHint}
        />
      ) : <ProfileNutritionSection goals={goals} />}

      {goals && (
        <div className="section-group">
          <div className="section-group__label">{t('Sua próxima refeição')}</div>
          <GoalMeals
            meta={profile.meta} goals={goals} totals={totals}
            meal={meal} onMealChange={setMeal}
            hour={now.getHours() + now.getMinutes() / 60} trainingHour={user?.user_metadata?.trainingHour}
            onAdd={foods => { const added = handleAddMany(foods); toast(t('Refeição registrada')); return added; }}
            onUndo={handleRemoveMany}
            habit={habit}
          />
        </div>
      )}

      <div className="section-group">
        {plan.length > 0 && <div className="section-group__label">{t('Sua dieta')}</div>}
        <DietPlan foods={foodList} plan={plan} onSave={handleSavePlan} onClear={handleClearPlan} onRegister={handleRegisterPlanMeal} />
      </div>

      <div className="section-group">
        {/* Com metas, a refeição se escolhe no card da próxima refeição; aqui só se mostra onde vai entrar. */}
        <div className="section-group__label">
          {goals ? t('Adicionar ao dia · {meal}', { meal: MEAL_NAME[meal]() }) : t('Adicionar ao dia')}
        </div>
        <div className="water-actions meal-pick">
          {!goals && (
            <label>
              {t('Refeição')}
              <select value={meal} onChange={e => setMeal(e.target.value)}>
                {MEALS.map(m => <option key={m} value={m}>{MEAL_NAME[m]()}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSearchOpen(o => !o)} aria-expanded={searchOpen}>
            {searchOpen ? t('Fechar busca') : t('🔎 Buscar alimento')}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTextOpen(o => !o)} aria-expanded={textOpen}>
            {textOpen ? t('Fechar texto') : t('✍️ Escrever o que comi')}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => (customOpen ? closeForm() : setCustomOpen(true))} aria-expanded={customOpen}>
            {customOpen ? t('Fechar') : t('+ Outro alimento')}
          </button>
        </div>
        {closing.length > 0 && (
          <div className="close-protein">
            <button type="button" className="link-btn" aria-expanded={closeOpen} onClick={() => setCloseOpen(o => !o)}>
              {t('Como fechar a meta de proteína')} {closeOpen ? '▴' : '▾'}
            </button>
            {closeOpen && <div className="water-actions">
              {closing.map(s => (
                <button key={s.food.id} type="button" className="btn btn--ghost btn--sm" onClick={() => handleAdd(portionFood(s))}>
                  {s.food.icon} {s.n > 1 ? `${s.n}× ` : ''}{s.food.label} · +{fmt(s.g)} g · {fmt(s.kcal)} kcal
                </button>
              ))}
            </div>}
          </div>
        )}
        {repeatItems.length > 0 && (
          <button
            type="button" className="link-btn"
            onClick={() => { handleAddMany(repeatItems); toast(t('{meal} de ontem repetido', { meal: MEAL_NAME[meal]() })); }}
          >
            ↻ {t('Repetir {meal} de ontem', { meal: MEAL_NAME[meal]().toLowerCase() })}
            {' '}({fmt(repeatItems.reduce((n, f) => n + f.kcal, 0))} kcal)
          </button>
        )}
        {textOpen && (
          <FreeTextMeal
            foods={foodList} mealName={MEAL_NAME[meal]()}
            onAdd={items => { handleAddMany(items); toast(t('Refeição registrada')); setTextOpen(false); }}
          />
        )}
        {searchOpen && <FoodSearch onAdd={handleAdd} recent={recent} used={used} catalog={catalog} />}
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
            <button type="submit" className="btn btn--primary btn--sm custom-food__submit">{editingEntry || editingId ? t('Salvar') : t('Adicionar')}</button>
          </form>
        )}

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

        {undoFood && (
          <div className="water-actions">
            <button type="button" className="link-btn" onClick={handleUndo}>
              ↶ {t('Desfazer {label}', { label: undoFood.label || `+${undoFood.g}g` })}
            </button>
          </div>
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
            <DayFixForm todayTotals={totals} logs={logs} onSaveToday={handleFixToday} onSavePast={handleFixPast} />
          )}
        </div>
      </div>

      {goals && (
        <NutritionWeek
          tdee={tdee} tdeeKcal={tdeeKcal} tdeeDiffers={tdeeDiffers} newKcal={newKcal} reading={reading}
          week={week} stats={stats} weightRate={weightRate} series={series} kcalSeries={kcalSeries}
          goalG={goalG} kcalGoal={kcalGoal} loading={loading}
        />
      )}

      <ProteinSources />
    </section>
  );
}
