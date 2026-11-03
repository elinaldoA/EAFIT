import { useState } from 'react';
import { t, locale } from '../lib/i18n';
import { fmtDate } from '../lib/utils';
import { MEAL_ORDER, goalFocus, suggestGoalMeals } from '../lib/goalMeals';

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

// Ritmo do dia (lib/nutritionCoach dayPace) em uma frase. O anel do resumo já
// diz quanto falta; aqui só o que muda a escolha da refeição.
function paceText({ status, behindG, left }) {
  if (status === 'over_kcal') return t('Você passou {kcal} kcal da meta. Se for comer de novo, só proteína magra.', { kcal: fmt(-left.kcal) });
  if (status === 'done') {
    return left.kcal > 0
      ? t('Proteína batida. Ainda cabem {kcal} kcal hoje.', { kcal: fmt(left.kcal) })
      : t('Proteína e calorias do dia completas.');
  }
  if (status === 'late') return t('O dia está acabando e ainda faltam {g} g de proteína. Priorize a proteína nesta refeição.', { g: fmt(left.protein) });
  if (status === 'behind') return t('{g} g de proteína atrás do ritmo para este horário. Priorize a proteína nesta refeição.', { g: fmt(behindG) });
  return left.kcal == null || left.kcal <= 0
    ? t('No ritmo para este horário.')
    : t('No ritmo para este horário. Ainda cabem {kcal} kcal hoje.', { kcal: fmt(left.kcal) });
}

const sumOf = items => items.reduce((s, f) => ({
  g: s.g + (f.g || 0), kcal: s.kcal + (f.kcal || 0), carbs: s.carbs + (f.carbs || 0), fat: s.fat + (f.fat || 0),
}), { g: 0, kcal: 0, carbs: 0, fat: 0 });

// A refeição de sempre (lib/nutritionCoach mealHabit) como opção, julgada pelo
// alvo do objetivo: se encaixa, vem primeiro; se não, depois da sugestão do objetivo.
function habitOption(habit, target, meal) {
  const total = sumOf(habit.items);
  const over = total.kcal - target.kcal;
  const shortG = target.protein - total.g;
  const fits = total.kcal <= target.kcal * HABIT_KCAL_OVER && total.g >= target.protein * HABIT_PROTEIN_MIN;
  let why;
  if (fits) why = t('É o que você costuma comer e cabe no alvo desta refeição.');
  else if (total.kcal > target.kcal * HABIT_KCAL_OVER) why = t('É o que você costuma comer, mas passa {kcal} kcal do alvo desta refeição.', { kcal: fmt(Math.round(over)) });
  else why = t('É o que você costuma comer, mas faltam {g} g de proteína para o alvo desta refeição.', { g: fmt(Math.round(shortG)) });
  const name = habit.kind === 'usual'
    ? t('O de sempre no {meal}', { meal: MEAL_NAME[meal]().toLowerCase() })
    : t('{meal} de {date}', { meal: MEAL_NAME[meal](), date: fmtDate(habit.date) });
  return { id: 'habit', habit: true, fits, name, why, items: habit.items, total };
}

// Um card só para a próxima refeição: o objetivo, o ritmo do dia, o alvo desta
// refeição e uma opção por vez (o hábito da pessoa e as refeições do objetivo),
// com as porções que fecham o que falta. A refeição escolhida aqui é a mesma do
// "Adicionar ao dia".
export default function GoalMeals({ meta, goals, totals, meal, onMealChange, hour, trainingHour, onAdd, pace, habit, spread }) {
  const [pick, setPick] = useState(0);
  const [tipsOpen, setTipsOpen] = useState(false);
  if (!goals) return null;
  const focus = goalFocus(meta);
  const { target, window: trainWindow, meals } = suggestGoalMeals({ goals, totals, meal, meta, hour, trainingHour });
  if (!target) return null;

  const options = [...meals];
  if (habit?.items?.length) {
    const h = habitOption(habit, target, meal);
    options.splice(h.fits ? 0 : Math.min(1, options.length), 0, h);
  }
  if (!options.length) return null;
  const current = options[pick % options.length];
  const tone = pace ? { behind: 'warn', late: 'warn', over_kcal: 'warn', done: 'ok' }[pace.status] || '' : '';

  const choose = m => { onMealChange(m); setPick(0); };
  const register = () => { onAdd(current.items); setPick(0); };

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Refeições para o seu objetivo')}</div>
      <div className="dash-card goal-meals">
        <div className="goal-meals__focus">
          <strong>{focus.title}</strong>
          <span>{focus.line}</span>
        </div>
        {pace && <p className={`coach__pace goal-meals__pace${tone ? ` coach__pace--${tone}` : ''}`}>{paceText(pace)}</p>}

        <div className="goal-meals__meals" role="tablist" aria-label={t('Escolha a refeição')}>
          {MEAL_ORDER.map(m => (
            <button
              key={m} type="button" role="tab" aria-selected={target.meal === m}
              className={`goal-meals__chip${target.meal === m ? ' goal-meals__chip--active' : ''}`}
              onClick={() => choose(m)}
            >{MEAL_NAME[m]()}</button>
          ))}
        </div>

        <p className="goal-meals__target">
          {target.tight
            ? t('As calorias de hoje estão quase no fim. Se tiver fome, algo leve com proteína:')
            : t('{meal}: mire em cerca de {kcal} kcal e {g} g de proteína para fechar o dia no seu objetivo.', {
              meal: MEAL_NAME[target.meal](), kcal: fmt(target.kcal), g: fmt(target.protein),
            })}
        </p>
        {trainWindow && (
          <p className="goal-meals__train">
            {trainWindow === 'pre'
              ? t('Você costuma treinar às {h}h: refeição de antes do treino, leve e com carboidrato.', { h: trainingHour })
              : t('Você costuma treinar às {h}h: hora de repor com proteína e carboidrato.', { h: trainingHour })}
          </p>
        )}

        <div className="goal-meals__card">
          <div className="goal-meals__head">
            <strong>{current.name}</strong>
            {current.habit && <span className="goal-meals__badge goal-meals__badge--habit">{t('Seu hábito')}</span>}
            {current.training && <span className="goal-meals__badge">{current.training === 'pre' ? t('Pré-treino') : t('Pós-treino')}</span>}
          </div>
          <ul className="goal-meals__items">
            {current.items.map((it, i) => (
              <li key={`${it.label}-${i}`}>
                <span aria-hidden="true">{it.icon}</span> {it.label}
              </li>
            ))}
          </ul>
          <div className="goal-meals__macros">
            <span><b>{fmt(current.total.kcal)}</b> kcal</span>
            <span><b>{fmt(current.total.g)}</b> g {t('prot')}</span>
            <span><b>{fmt(current.total.carbs)}</b> g {t('carbo')}</span>
            <span><b>{fmt(current.total.fat)}</b> g {t('gord')}</span>
          </div>
          <p className="dash-card__subtitle goal-meals__why">{current.why}</p>
          <div className="goal-meals__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={register}>
              {t('Registrar esta refeição')}
            </button>
            {options.length > 1 && (
              <button type="button" className="link-btn" onClick={() => setPick(i => i + 1)}>
                {t('Outra sugestão ({i}/{n})', { i: (pick % options.length) + 1, n: options.length })}
              </button>
            )}
          </div>
        </div>

        {spread && (
          <p className="dash-card__subtitle goal-meals__spread">
            {t('{share}% da proteína de hoje veio de uma refeição só ({meal}). Amanhã, divida melhor entre as refeições.', { share: spread.share, meal: MEAL_NAME[spread.meal]?.() || spread.meal })}
          </p>
        )}

        <button type="button" className="link-btn goal-meals__tips-btn" onClick={() => setTipsOpen(o => !o)} aria-expanded={tipsOpen}>
          {tipsOpen ? t('Esconder as regras do seu objetivo') : t('Ver as regras do seu objetivo')}
        </button>
        {tipsOpen && (
          <ul className="goal-meals__tips">
            {focus.tips.map(tip => <li key={tip}>{tip}</li>)}
          </ul>
        )}
        <p className="dash-card__subtitle">{t('Porções calculadas pelas suas metas. Não substituem orientação de nutricionista.')}</p>
      </div>
    </div>
  );
}
