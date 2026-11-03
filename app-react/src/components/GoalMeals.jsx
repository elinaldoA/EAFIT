import { useState } from 'react';
import { t, locale } from '../lib/i18n';
import { MEAL_ORDER, goalFocus, suggestGoalMeals } from '../lib/goalMeals';

const fmt = n => n.toLocaleString(locale);
const MEAL_NAME = {
  cafe: () => t('Café da manhã'),
  almoco: () => t('Almoço'),
  lanche: () => t('Lanche'),
  jantar: () => t('Jantar'),
  ceia: () => t('Ceia'),
};

// Refeições montadas para a meta principal, com porções que fecham o que falta
// do dia. A refeição escolhida aqui é a mesma do "Adicionar ao dia".
export default function GoalMeals({ meta, goals, totals, meal, onMealChange, hour, trainingHour, onAdd }) {
  const [pick, setPick] = useState(0);
  const [tipsOpen, setTipsOpen] = useState(false);
  if (!goals) return null;
  const focus = goalFocus(meta);
  const { target, window: trainWindow, meals } = suggestGoalMeals({ goals, totals, meal, meta, hour, trainingHour });
  if (!target || !meals.length) return null;
  const current = meals[pick % meals.length];

  const choose = m => { onMealChange(m); setPick(0); };

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Refeições para o seu objetivo')}</div>
      <div className="dash-card goal-meals">
        <div className="goal-meals__focus">
          <strong>{focus.title}</strong>
          <span>{focus.line}</span>
        </div>

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
            {current.training && <span className="goal-meals__badge">{current.training === 'pre' ? t('Pré-treino') : t('Pós-treino')}</span>}
          </div>
          <ul className="goal-meals__items">
            {current.items.map(it => (
              <li key={it.label}>
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
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onAdd(current.items)}>
              {t('Registrar esta refeição')}
            </button>
            {meals.length > 1 && (
              <button type="button" className="link-btn" onClick={() => setPick(i => i + 1)}>
                {t('Outra sugestão ({i}/{n})', { i: (pick % meals.length) + 1, n: meals.length })}
              </button>
            )}
          </div>
        </div>

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
