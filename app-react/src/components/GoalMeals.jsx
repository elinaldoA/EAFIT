import { useState } from 'react';
import { t, locale } from '../lib/i18n';
import { fmtDate } from '../lib/utils';
import { MEALS } from '../lib/nutritionEntries';
import { goalFocus, suggestGoalMeals } from '../lib/goalMeals';

const fmt = n => n.toLocaleString(locale);
const MEAL_NAME = {
  cafe: () => t('Café da manhã'),
  almoco: () => t('Almoço'),
  lanche: () => t('Lanche'),
  jantar: () => t('Jantar'),
  ceia: () => t('Ceia'),
  outro: () => t('Outros'),
};
// O hábito encaixa no alvo quando não passa 25% das calorias e traz 70% da proteína.
const HABIT_KCAL_OVER = 1.25;
const HABIT_PROTEIN_MIN = 0.7;

const sumOf = items => items.reduce((s, f) => ({
  g: s.g + (f.g || 0), kcal: s.kcal + (f.kcal || 0), carbs: s.carbs + (f.carbs || 0), fat: s.fat + (f.fat || 0),
}), { g: 0, kcal: 0, carbs: 0, fat: 0 });

// A refeição de sempre (lib/nutritionCoach mealHabit) como opção, julgada pelo
// alvo do objetivo: se encaixa, vem primeiro; se não, depois da sugestão do objetivo.
function habitOption(habit, target, meal) {
  const total = sumOf(habit.items);
  const fits = total.kcal <= target.kcal * HABIT_KCAL_OVER && total.g >= target.protein * HABIT_PROTEIN_MIN;
  let why;
  if (fits) why = t('É o que você costuma comer e cabe no alvo desta refeição.');
  else if (total.kcal > target.kcal * HABIT_KCAL_OVER) why = t('É o que você costuma comer, mas passa {kcal} kcal do alvo desta refeição.', { kcal: fmt(Math.round(total.kcal - target.kcal)) });
  else why = t('É o que você costuma comer, mas faltam {g} g de proteína para o alvo desta refeição.', { g: fmt(Math.round(target.protein - total.g)) });
  const name = habit.kind === 'usual'
    ? t('O de sempre no {meal}', { meal: MEAL_NAME[meal]().toLowerCase() })
    : t('{meal} de {date}', { meal: MEAL_NAME[meal](), date: fmtDate(habit.date) });
  return { id: 'habit', habit: true, fits, name, why, items: habit.items, total };
}

// A próxima refeição, e só ela: quanto comer, o quê e um botão. A refeição
// escolhida aqui é a mesma em que "Adicionar ao dia" registra. O objetivo e as
// regras ficam num link fechado.
export default function GoalMeals({ meta, goals, totals, meal, onMealChange, hour, trainingHour, onAdd, habit }) {
  const [pick, setPick] = useState(0);
  const [howOpen, setHowOpen] = useState(false);
  if (!goals) return null;
  const { target, meals } = suggestGoalMeals({ goals, totals, meal, meta, hour, trainingHour });
  if (!target) return null;

  const options = [...meals];
  if (habit?.items?.length) {
    const h = habitOption(habit, target, meal);
    options.splice(h.fits ? 0 : Math.min(1, options.length), 0, h);
  }
  if (!options.length) return null;
  const current = options[pick % options.length];
  const focus = goalFocus(meta);

  const register = () => { onAdd(current.items); setPick(0); };

  return (
    <div className="dash-card goal-meals">
      <div className="goal-meals__top">
        <div className="goal-meals__title">
          <select
            className="goal-meals__meal" value={meal} aria-label={t('Refeição')}
            onChange={e => { onMealChange(e.target.value); setPick(0); }}
          >
            {MEALS.map(m => <option key={m} value={m}>{MEAL_NAME[m]()}</option>)}
          </select>
          <span className="goal-meals__target">
            {target.tight
              ? t('Calorias do dia quase no fim: algo leve')
              : t('cerca de {kcal} kcal · {g} g de proteína', { kcal: fmt(target.kcal), g: fmt(target.protein) })}
          </span>
        </div>
      </div>

      <div className="goal-meals__card">
        <div className="goal-meals__head">
          <strong>{current.name}</strong>
          {current.habit && <span className="goal-meals__badge goal-meals__badge--habit">{t('Seu hábito')}</span>}
          {current.training && <span className="goal-meals__badge">{current.training === 'pre' ? t('Pré-treino') : t('Pós-treino')}</span>}
        </div>
        <ul className="goal-meals__items">
          {current.items.map((it, i) => (
            <li key={`${it.label}-${i}`}>
              <span aria-hidden="true">{it.icon}</span>
              <span className="goal-meals__name">{it.name || it.label}</span>
              {it.amount && <span className="goal-meals__amount">{it.amount}</span>}
            </li>
          ))}
        </ul>
        <p className="goal-meals__macros">
          {t('{kcal} kcal · {g} g prot · {carbs} g carbo · {fat} g gord', {
            kcal: fmt(current.total.kcal), g: fmt(current.total.g), carbs: fmt(current.total.carbs), fat: fmt(current.total.fat),
          })}
        </p>
        <p className="goal-meals__why">{current.why}</p>
        <div className="goal-meals__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={register}>
            {t('Registrar esta refeição')}
          </button>
          {options.length > 1 && (
            <button type="button" className="link-btn" onClick={() => setPick(i => i + 1)}>
              {t('Outra opção')} →
            </button>
          )}
        </div>
      </div>

      <button type="button" className="link-btn goal-meals__how" onClick={() => setHowOpen(o => !o)} aria-expanded={howOpen}>
        {t('Como comer para: {goal}', { goal: focus.title.toLowerCase() })} {howOpen ? '▾' : '›'}
      </button>
      {howOpen && (
        <div className="goal-meals__how-body">
          <p>{focus.line}</p>
          <ul>{focus.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
          <p className="dash-card__subtitle">{t('Porções calculadas pelas suas metas. Não substituem orientação de nutricionista.')}</p>
        </div>
      )}
    </div>
  );
}
