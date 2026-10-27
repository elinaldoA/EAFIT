import { MEALS } from '../lib/nutritionEntries';
import { t } from '../lib/i18n';

const MEAL_LABEL = {
  cafe: () => t('Café da manhã'),
  almoco: () => t('Almoço'),
  lanche: () => t('Lanche'),
  jantar: () => t('Jantar'),
  outro: () => t('Outros'),
};

// Diário do dia agrupado por refeição. `rest` é o que está nos totais mas não
// tem detalhe (registros de antes do diário ou ajuste manual do dia).
export default function MealLog({ entries, rest, onEdit, onDelete }) {
  const groups = MEALS.map(m => ({ meal: m, items: entries.filter(e => e.meal === m) })).filter(gr => gr.items.length);
  if (!groups.length && !rest) return <p className="dash-card__subtitle">{t('Nada registrado hoje. Toque num alimento para começar.')}</p>;
  return (
    <div className="meal-log">
      {groups.map(({ meal, items }) => (
        <div key={meal} className="meal-log__group">
          <div className="meal-log__title">
            {MEAL_LABEL[meal]()}
            <small>{items.reduce((s, e) => s + e.kcal, 0)} kcal</small>
          </div>
          <ul>
            {items.map(e => (
              <li key={e.id} className="meal-log__item">
                <span className="meal-log__name"><span aria-hidden="true">{e.icon}</span> {e.label}</span>
                <span className="meal-log__macros">{e.kcal} kcal · {e.g} g {t('prot')}</span>
                <button type="button" className="meal-log__btn" aria-label={t('Editar "{name}"', { name: e.label })} onClick={() => onEdit(e)}>✎</button>
                <button type="button" className="meal-log__btn" aria-label={t('Remover "{name}"', { name: e.label })} onClick={() => onDelete(e)}>×</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {rest && (
        <p className="dash-card__subtitle">
          {t('Sem detalhe: {kcal} kcal · {g} g prot', { kcal: rest.kcal, g: rest.protein })}
        </p>
      )}
    </div>
  );
}
