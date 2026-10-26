import { t } from '../lib/i18n';

// Metas diárias estimadas (somente leitura): calculadas do Perfil, sem
// registro de refeições.
export default function ProfileNutritionSection({ goals }) {
  if (!goals) {
    return <p className="profile-field__hint">{t('Preencha sexo, idade, peso e altura em "Meu corpo" para ver suas metas de nutrição.')}</p>;
  }
  const items = [
    [t('Calorias'), `${goals.kcal} kcal`],
    [t('Proteína'), `${goals.protein} g`],
    [t('Carboidratos'), `${goals.carbs} g`],
    [t('Gorduras'), `${goals.fat} g`],
  ];
  return (
    <>
      <dl className="nutrition-goals">
        {items.map(([label, value]) => (
          <div key={label} className="nutrition-goals__item">
            <dt className="profile-field__label">{label}</dt>
            <dd><strong>{value}</strong></dd>
          </div>
        ))}
      </dl>
      <p className="profile-field__hint">
        {t('Estimativa por dia (Mifflin-St Jeor), ajustada pela sua meta principal e pelos treinos por semana. Não substitui orientação de nutricionista.')}
      </p>
    </>
  );
}
