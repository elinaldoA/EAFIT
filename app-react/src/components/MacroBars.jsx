import { t, locale } from '../lib/i18n';
import { pctOfGoal } from '../lib/nutritionTotals';

const fmt = n => n.toLocaleString(locale);

// Progresso do dia contra as metas: calorias e os três macros. compact: em
// linha, sem a proteína (o anel da página já mostra).
export default function MacroBars({ totals, goals, compact = false }) {
  const all = [
    { key: 'kcal', label: t('Calorias'), unit: 'kcal', value: totals.kcal, goal: goals.kcal },
    { key: 'protein', label: t('Proteína'), unit: 'g', value: totals.protein, goal: goals.protein },
    { key: 'carbs', label: t('Carboidratos'), unit: 'g', value: totals.carbs, goal: goals.carbs },
    { key: 'fat', label: t('Gorduras'), unit: 'g', value: totals.fat, goal: goals.fat },
  ];
  const rows = compact ? all.filter(r => r.key !== 'protein') : all;
  return (
    <ul className={`macro-bars${compact ? ' macro-bars--compact' : ''}`}>
      {rows.map(r => {
        const pct = pctOfGoal(r.value, r.goal);
        return (
          <li key={r.key} className="macro-bars__row">
            <div className="macro-bars__head">
              <span>{r.label}</span>
              {compact
                ? <strong>{fmt(r.value)}<small>/{fmt(r.goal)}</small></strong>
                : <strong>{fmt(r.value)} <small>/ {fmt(r.goal)} {r.unit}</small></strong>}
            </div>
            <div
              className={`macro-bars__track${r.value >= r.goal ? ' macro-bars__track--done' : ''}`}
              role="progressbar"
              aria-label={r.label}
              aria-valuemin={0}
              aria-valuemax={r.goal}
              aria-valuenow={r.value}
            >
              <div className={`macro-bars__fill macro-bars__fill--${r.key}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
