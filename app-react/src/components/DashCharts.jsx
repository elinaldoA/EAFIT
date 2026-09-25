import { todayDate } from '../data/treinoData';
import { fmtDate, parseLocalDate, toDateStr, getWeekStart } from '../lib/utils';
import { estimateOneRepMax } from '../lib/records';

export function Heatmap({ workouts }) {
  const dateMap = {};
  workouts.forEach(w => { dateMap[w.workout_date] = w.completed ? 'done' : 'miss'; });

  const today = parseLocalDate(todayDate());
  const todayDow = today.getDay();
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - (todayDow === 0 ? 6 : todayDow - 1));
  const startMonday = new Date(currentMonday);
  startMonday.setDate(currentMonday.getDate() - 28);

  const cells = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(startMonday);
    d.setDate(startMonday.getDate() + i);
    const dateStr = toDateStr(d);
    const isFuture = d > today;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    let c = 'none';
    if (isFuture) c = 'future';
    else if (dateMap[dateStr] === 'done') c = 'done';
    else if (dateMap[dateStr] === 'miss') c = 'miss';
    else if (isWeekend) c = 'rest';

    cells.push({ dateStr, c });
  }

  return (
    <div className="heatmap" id="dashHeatmap">
      {cells.map(cell => (
        <div key={cell.dateStr} className={`heatmap-cell heatmap-cell--${cell.c}`} title={cell.dateStr} />
      ))}
    </div>
  );
}

export function WeeklyBars({ workouts, weeklyGoal }) {
  const today = parseLocalDate(todayDate());
  const todayDow = today.getDay();
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - (todayDow === 0 ? 6 : todayDow - 1));

  const buckets = [];
  for (let w = 7; w >= 0; w--) {
    const mon = new Date(currentMonday);
    mon.setDate(currentMonday.getDate() - w * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const mStr = toDateStr(mon);
    const sStr = toDateStr(sun);
    const label = w === 0 ? 'Esta' : w === 1 ? 'Ant.' :
      `${String(mon.getDate()).padStart(2, '0')}/${String(mon.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({ mStr, sStr, label, done: 0 });
  }

  workouts.filter(w => w.completed).forEach(w => {
    const b = buckets.find(b => w.workout_date >= b.mStr && w.workout_date <= b.sStr);
    if (b) b.done++;
  });

  return (
    <div className="bar-chart" id="dashBarChart">
      {buckets.map(b => (
        <div className="bar-col" key={b.label + b.mStr}>
          <div className="bar-col__wrap">
            <div className="bar-col__fill" style={{ height: `${Math.round((b.done / weeklyGoal) * 100)}%` }} />
          </div>
          <span className="bar-col__val">{b.done}</span>
          <span className="bar-col__label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export function PRList({ logs }) {
  if (!logs.length) {
    return <p className="dash-empty">Nenhuma carga registrada ainda. Registre cargas na aba Treino.</p>;
  }

  const prMap = {};
  logs.forEach(log => {
    const val = parseFloat(log.carga);
    if (isNaN(val)) return;
    const oneRm = estimateOneRepMax(log.carga, log.reps);

    const entry = prMap[log.exercise_name] || { val: -Infinity, date: null, oneRm: null };
    if (val > entry.val) { entry.val = val; entry.date = log.workout_date; }
    if (oneRm !== null && (entry.oneRm === null || oneRm > entry.oneRm)) entry.oneRm = oneRm;
    prMap[log.exercise_name] = entry;
  });

  const sorted = Object.entries(prMap).sort((a, b) => b[1].val - a[1].val).slice(0, 12);
  const top = sorted[0]?.[1].val || 1;
  if (!sorted.length) return <p className="dash-empty">Nenhuma carga numérica registrada ainda.</p>;

  return (
    <div id="dashPRList" className="pr-list">
      {sorted.map(([name, { val, date, oneRm }]) => (
        <div className="pr-row" key={name}>
          <div className="pr-row__left">
            <div className="pr-row__name">{name}</div>
            <div className="pr-row__bar"><div style={{ width: `${(val / top) * 100}%` }} /></div>
          </div>
          <div className="pr-row__right">
            <span className="pr-row__val">{val.toLocaleString('pt-BR')}kg</span>
            <span className="pr-row__meta">
              {oneRm != null && <>1RM ~{Math.round(oneRm).toLocaleString('pt-BR')}kg · </>}{fmtDate(date)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WeekCompare({ logs, exercise }) {
  const thisWeekStart = getWeekStart();
  const lastWeekStart = getWeekStart(1);

  const filtered = logs.filter(l => l.exercise_name === exercise && !isNaN(parseFloat(l.carga)));
  const thisWeek = filtered.filter(l => l.workout_date >= thisWeekStart);
  const lastWeek = filtered.filter(l => l.workout_date >= lastWeekStart && l.workout_date < thisWeekStart);
  const bestThis = thisWeek.length ? Math.max(...thisWeek.map(l => parseFloat(l.carga))) : null;
  const bestLast = lastWeek.length ? Math.max(...lastWeek.map(l => parseFloat(l.carga))) : null;

  if (bestThis === null && bestLast === null) return null;

  let diffMsg = null;
  if (bestThis !== null && bestLast !== null) {
    const delta = bestThis - bestLast;
    if (delta > 0) diffMsg = `📈 +${delta.toFixed(1)}kg em relação à semana passada`;
    else if (delta < 0) diffMsg = `📉 ${delta.toFixed(1)}kg em relação à semana passada`;
    else diffMsg = '➡️ Mesma carga da semana passada';
  }

  return (
    <div className="week-compare">
      <div className="week-compare__row">
        <span>Semana passada</span>
        <strong>{bestLast !== null ? `${bestLast}kg` : '–'}</strong>
      </div>
      <div className="week-compare__row">
        <span>Esta semana</span>
        <strong>{bestThis !== null ? `${bestThis}kg` : '–'}</strong>
      </div>
      {diffMsg && <p className="week-compare__diff">{diffMsg}</p>}
    </div>
  );
}

export function LoadHistory({ points }) {
  if (!points.length) return null;
  const reversed = [...points].slice().reverse();
  return (
    <div className="load-history">
      {reversed.map((p, i) => (
        <div className="load-history__row" key={`${p.label}-${i}`}>
          <span className="load-history__date">{p.label}</span>
          <span className="load-history__val">{p.value}kg</span>
        </div>
      ))}
    </div>
  );
}
