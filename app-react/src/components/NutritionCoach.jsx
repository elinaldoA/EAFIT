import { t, locale } from '../lib/i18n';
import { fmtDate } from '../lib/utils';

const fmt = n => n.toLocaleString(locale);
const MEAL_NAME = {
  cafe: () => t('Café da manhã'),
  almoco: () => t('Almoço'),
  lanche: () => t('Lanche'),
  jantar: () => t('Jantar'),
  ceia: () => t('Ceia'),
  outro: () => t('Outros'),
};

// O anel já diz quanto falta de proteína; aqui só o que muda a decisão.
function paceText({ status, behindG, left }) {
  if (status === 'over_kcal') return t('Você passou {kcal} kcal da meta. Se for comer de novo, só proteína magra.', { kcal: fmt(-left.kcal) });
  if (status === 'done') {
    return left.kcal > 0
      ? t('Proteína batida. Ainda cabem {kcal} kcal hoje.', { kcal: fmt(left.kcal) })
      : t('Proteína e calorias do dia completas.');
  }
  if (status === 'late') return t('O dia está acabando e falta proteína. Feche agora:');
  if (status === 'behind') return t('{g} g atrás do ritmo para este horário. Priorize proteína agora:', { g: fmt(behindG) });
  return left.kcal == null || left.kcal <= 0
    ? t('No ritmo para este horário.')
    : t('No ritmo para este horário. Ainda cabem {kcal} kcal hoje.', { kcal: fmt(left.kcal) });
}

// Próximo passo do dia: uma leitura do ritmo e uma ação só. action vem pronta
// da página: { kind: 'usual' | 'last' | 'suggest', label, foods, date? }.
export default function NutritionCoach({ pace, action, meal, hasMore, onAdd, onNext, spread }) {
  if (!pace && !action) return null;
  const tone = pace ? { behind: 'warn', late: 'warn', over_kcal: 'warn', done: 'ok' }[pace.status] || '' : '';
  const sum = k => action.foods.reduce((s, f) => s + (f[k] || 0), 0);
  const origin = action && {
    usual: () => t('O de sempre no {meal}', { meal: MEAL_NAME[meal]().toLowerCase() }),
    last: () => t('{meal} de {date}', { meal: MEAL_NAME[meal](), date: fmtDate(action.date) }),
  }[action.kind];
  return (
    <div className="dash-card coach">
      <span className="coach__title">{t('Próximo passo')}</span>
      {pace && <p className={`coach__pace${tone ? ` coach__pace--${tone}` : ''}`}>{paceText(pace)}</p>}

      {action && (
        <div className="coach__action">
          <div className="coach__what">
            <strong><span aria-hidden="true">{action.foods.map(f => f.icon).join(' ')}</span> {action.label}</strong>
            <small>
              {origin && `${origin()} · `}
              {t('+{g} g prot · {kcal} kcal', { g: fmt(sum('g')), kcal: fmt(sum('kcal')) })}
            </small>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => onAdd(action.foods)}>{t('Registrar agora')}</button>
        </div>
      )}
      {hasMore && <button type="button" className="link-btn coach__next" onClick={onNext}>{t('Outra opção')}</button>}

      {spread && (
        <p className="dash-card__subtitle coach__tip">
          {t('{share}% da proteína de hoje veio de uma refeição só ({meal}). Amanhã, divida melhor entre as refeições.', { share: spread.share, meal: MEAL_NAME[spread.meal]() })}
        </p>
      )}
    </div>
  );
}
