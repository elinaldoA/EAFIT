import { t, locale } from '../lib/i18n';
import { fmtDate } from '../lib/utils';
import { portionFood } from '../lib/nutritionCoach';

const fmt = n => n.toLocaleString(locale);
const MEAL_NAME = {
  cafe: () => t('Café da manhã'),
  almoco: () => t('Almoço'),
  lanche: () => t('Lanche'),
  jantar: () => t('Jantar'),
  outro: () => t('Outros'),
};

function paceText(pace) {
  const { status, behindG, left } = pace;
  if (status === 'over_kcal') return t('Você passou {kcal} kcal da meta. Se ainda for comer, prefira algo leve e rico em proteína.', { kcal: fmt(-left.kcal) });
  if (status === 'done') {
    return left.kcal > 0
      ? t('Proteína do dia garantida. Ainda cabem {kcal} kcal.', { kcal: fmt(left.kcal) })
      : t('Proteína e calorias do dia completas.');
  }
  if (status === 'late') return t('Faltam {g} g de proteína e o dia está acabando. Um lanche proteico resolve.', { g: fmt(left.protein) });
  if (status === 'behind') return t('Você está {g} g atrás do ritmo de proteína para este horário.', { g: fmt(behindG) });
  return left.kcal == null
    ? t('No ritmo. Faltam {g} g de proteína.', { g: fmt(left.protein) })
    : t('No ritmo. Faltam {g} g de proteína e {kcal} kcal.', { g: fmt(left.protein), kcal: fmt(Math.max(0, left.kcal)) });
}

// Assistente do dia: ritmo contra a hora, o que comer para fechar a meta e a
// refeição de sempre num toque. Só lê; quem grava é a página (onAdd).
export default function NutritionCoach({ pace, suggestions, habit, meal, spread, onAdd }) {
  if (!pace && !habit && !spread) return null;
  const tone = pace ? { behind: 'warn', late: 'warn', over_kcal: 'warn', done: 'ok' }[pace.status] || '' : '';
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Assistente do dia')}</div>
      <div className="dash-card coach">
        {pace && <p className={`coach__pace${tone ? ` coach__pace--${tone}` : ''}`}>{paceText(pace)}</p>}

        {suggestions.length > 0 && (
          <div className="coach__block">
            <span className="coach__title">{t('Para fechar a proteína')}</span>
            <div className="coach__chips">
              {suggestions.map(s => (
                <button key={s.food.id || s.food.label} type="button" className="coach__chip" onClick={() => onAdd([portionFood(s)])}>
                  <span className="coach__chip-name"><span aria-hidden="true">{s.food.icon}</span> {s.n > 1 ? `${s.n}× ` : ''}{s.food.label}</span>
                  <small>+{fmt(s.g)} g · {fmt(s.kcal)} kcal</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {habit && (
          <div className="coach__block">
            <span className="coach__title">
              {habit.kind === 'usual'
                ? t('O de sempre · {meal}', { meal: MEAL_NAME[meal]() })
                : t('Repetir · {meal} de {date}', { meal: MEAL_NAME[meal](), date: fmtDate(habit.date) })}
            </span>
            <p className="coach__habit">
              {habit.items.map(i => `${i.icon} ${i.label}`).join(' · ')}
              <small>
                {t('{kcal} kcal · {g} g prot', {
                  kcal: fmt(habit.items.reduce((s, i) => s + i.kcal, 0)),
                  g: fmt(habit.items.reduce((s, i) => s + i.g, 0)),
                })}
              </small>
            </p>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onAdd(habit.items)}>
              {habit.items.length > 1 ? t('Adicionar os {n}', { n: habit.items.length }) : t('Adicionar')}
            </button>
          </div>
        )}

        {spread && (
          <p className="dash-card__subtitle coach__tip">
            {t('{share}% da proteína de hoje veio de uma refeição só ({meal}). Dividir entre as refeições ajuda a construir músculo.', { share: spread.share, meal: MEAL_NAME[spread.meal]() })}
          </p>
        )}
      </div>
    </div>
  );
}
