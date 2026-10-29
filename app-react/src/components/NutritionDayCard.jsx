import { t, locale } from '../lib/i18n';
import { pctOfGoal } from '../lib/nutritionTotals';

const fmt = n => n.toLocaleString(locale);
const fmtDec = n => n.toLocaleString(locale, { maximumFractionDigits: 1 });

// kcal por grama de cada macro: a pizza mostra de onde vieram as calorias.
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };
const R = 50;

function slicePath(from, to) {
  if (to - from >= 0.9999) return null; // fatia única: vira círculo
  const point = f => [R + R * Math.sin(2 * Math.PI * f), R - R * Math.cos(2 * Math.PI * f)];
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${R},${R} L${x1},${y1} A${R},${R} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2},${y2} Z`;
}

function MacroPie({ slices, kcal }) {
  const total = slices.reduce((s, x) => s + x.kcal, 0);
  let acc = 0;
  return (
    <svg className="nutri-pie" viewBox="0 0 100 100" role="img"
      aria-label={total ? slices.map(s => `${s.label} ${s.share}%`).join(', ') : t('Nada registrado hoje')}>
      {!total && <circle cx={R} cy={R} r={R} className="nutri-pie__empty" />}
      {total > 0 && slices.filter(s => s.kcal > 0).map(s => {
        const from = acc;
        acc += s.kcal / total;
        const d = slicePath(from, acc);
        const title = <title>{t('{macro}: {pct}% das calorias', { macro: s.label, pct: s.share })}</title>;
        return d
          ? <path key={s.key} d={d} className={`nutri-pie__slice nutri-pie__slice--${s.key}`}>{title}</path>
          : <circle key={s.key} cx={R} cy={R} r={R} className={`nutri-pie__slice nutri-pie__slice--${s.key}`}>{title}</circle>;
      })}
      {!total && <text x={R} y={R + 5} textAnchor="middle" className="nutri-pie__label">{fmt(kcal)} kcal</text>}
    </svg>
  );
}

function Row({ k, label, value, text, goal, unit, note, limit = false, dot = false }) {
  const pct = goal ? pctOfGoal(value, goal) : 0;
  let state = '';
  if (goal && limit && value > goal) state = ' nutri-day__row--over';
  else if (goal && !limit && value >= goal) state = ' nutri-day__row--done';
  return (
    <li className={`nutri-day__row${state}`}>
      <span className="nutri-day__name">
        {dot && <i className={`nutri-day__dot nutri-day__dot--${k}`} aria-hidden="true" />}
        {label}
        {note && <small>{note}</small>}
      </span>
      <strong>
        {text}
        <small>{goal ? (limit ? t(' / até {g} {u}', { g: fmt(goal), u: unit }) : ` / ${fmt(goal)} ${unit}`) : ` ${unit}`}</small>
      </strong>
      {goal ? (
        <div className="nutri-day__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={value}>
          <div className={`nutri-day__fill nutri-day__fill--${k}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </li>
  );
}

// O dia inteiro num card: a pizza diz de onde vieram as calorias e as linhas
// trazem cada nutriente contra a meta (sódio é teto, não alvo). micros só
// conta os registros que trazem fibra/sódio (busca e TACO).
export default function NutritionDayCard({ totals, goals, micros, status, hint }) {
  const kcalFromMacros = Object.entries(KCAL_PER_G).reduce((s, [k, f]) => s + (totals[k] || 0) * f, 0);
  const macros = [
    { key: 'protein', label: t('Proteína'), value: totals.protein, goal: goals.protein },
    { key: 'carbs', label: t('Carboidratos'), value: totals.carbs, goal: goals.carbs },
    { key: 'fat', label: t('Gorduras'), value: totals.fat, goal: goals.fat },
  ].map(m => {
    const kcal = (m.value || 0) * KCAL_PER_G[m.key];
    return { ...m, kcal, share: kcalFromMacros ? Math.round((kcal / kcalFromMacros) * 100) : 0 };
  });
  const kcalPct = pctOfGoal(totals.kcal, goals.kcal);
  const kcalOver = goals.kcal && totals.kcal > goals.kcal;

  return (
    <div className="dash-card nutri-day">
      <div className="nutri-day__top">
        <MacroPie slices={macros} kcal={totals.kcal} />
        <div className="nutri-day__head">
          <span className="nutri-day__kicker">{t('Hoje')}</span>
          <strong className="nutri-day__kcal">
            {fmt(totals.kcal)}<small>{t(' de {g} kcal', { g: fmt(goals.kcal) })}</small>
          </strong>
          <div className={`nutri-day__track${kcalOver ? ' nutri-day__track--over' : ''}`} role="progressbar"
            aria-label={t('Calorias')} aria-valuemin={0} aria-valuemax={goals.kcal} aria-valuenow={totals.kcal}>
            <div className="nutri-day__fill nutri-day__fill--kcal" style={{ width: `${kcalPct}%` }} />
          </div>
          <span className="nutri-day__status">{status}</span>
          {hint && <span className="nutri-day__hint">{hint}</span>}
        </div>
      </div>

      <ul className="nutri-day__rows">
        {macros.map(m => (
          <Row key={m.key} k={m.key} dot label={m.label} value={m.value} text={fmt(m.value)} goal={m.goal} unit="g"
            note={kcalFromMacros ? t('{pct}% das kcal', { pct: m.share }) : null} />
        ))}
        <Row k="fiber" label={t('Fibras')} value={micros?.fiber || 0} text={micros ? fmtDec(micros.fiber) : '—'} goal={goals.fiber} unit="g" />
        <Row k="sodium" label={t('Sódio')} value={micros?.sodium || 0} text={micros ? fmt(micros.sodium) : '—'} goal={goals.sodium} unit="mg" limit />
      </ul>
      {micros?.partial && (
        <p className="nutri-day__note">{t('Fibras e sódio só contam os alimentos da busca e da TACO; atalhos e valores digitados não trazem esse dado.')}</p>
      )}
    </div>
  );
}
