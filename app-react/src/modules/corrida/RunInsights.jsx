import { useState } from 'react';
import { todayDate } from '../../data/treinoData';
import { formatKm, formatClock, formatPace } from './runs';
import { achievements, weeklyLoad, weekEffort, racePredictions, paceTrend, goalProgress, effortHistory, EFFORT_HISTORY_KM } from './runReadings';
import { kmGoals } from './runProfileStats';
import { weatherBands } from './weatherInsights';
import { monthRuns } from './runSummary';
import { tempText } from './weather';
import RunFitness from './RunFitness';
import MonthlyBadges from './MonthlyBadges';
import { t } from '../../lib/i18n';

// Leituras da aba Você do EAFIT Run: carga da semana, previsão de prova,
// tendência de ritmo e conquistas. Recebe as corridas já carregadas.

const GOAL_LABEL = { week: () => t('Semana'), month: () => t('Mês'), year: () => t('Ano') };

function Goals({ runs, today, meta }) {
  const list = goalProgress(runs, today, kmGoals(meta));
  if (!list.length) return null;
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Metas de km')}</div>
      <div className="dash-card run-goals">
        {list.map(g => (
          <div key={g.key} className="run-goal">
            <div className="run-goal__head">
              <strong>{GOAL_LABEL[g.key]()}</strong>
              <span>{formatKm(g.doneM, 1)} / {formatKm(g.goalKm * 1000, 1)} km · {g.pct}%</span>
            </div>
            <div className="run-goal__bar" role="img" aria-label={`${GOAL_LABEL[g.key]()}: ${g.pct}%`}>
              <span style={{ width: `${g.pct}%` }} />
            </div>
            <p className="profile-field__hint">
              {g.leftKm === 0
                ? t('🎉 Meta batida!')
                : g.perWeekKm === null
                  ? t('Faltam {v1} km', { v1: formatKm(g.leftKm * 1000, 1) })
                  : t('Faltam {v1} km · cerca de {v2} km por semana até o fim', { v1: formatKm(g.leftKm * 1000, 1), v2: formatKm(g.perWeekKm * 1000, 1) })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekLoad({ runs, today }) {
  const load = weeklyLoad(runs, today);
  const effort = weekEffort(runs, today);
  if (load.level === null) return null;
  const tone = load.level === 'alto' ? 'run-load--high' : 'run-load--ok';
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Carga da semana')}</div>
      <div className={`dash-card run-load ${tone}`}>
        <div className="run-load__numbers">
          <div><strong>{formatKm(load.thisWeek, 1)}</strong><small>{t('km esta semana')}</small></div>
          <div><strong>{formatKm(load.lastWeek, 1)}</strong><small>{t('km na semana passada')}</small></div>
          <div><strong>{formatKm(load.avg4, 1)}</strong><small>{t('média das 4 últimas')}</small></div>
        </div>
        <p className="run-load__msg">
          {load.level === 'alto'
            ? t('⚠️ Você já passou de 10% sobre a semana passada. Que tal um dia leve ou de descanso?')
            : t('✅ Dá para correr mais {v1} km sem passar de 10% sobre a semana passada.', { v1: formatKm(load.roomM, 1) })}
        </p>
        {effort !== null && <p className="profile-field__hint">{t('Esforço médio das corridas da semana: {v1}/10', { v1: effort })}</p>}
      </div>
    </div>
  );
}

function Predictions({ runs, today }) {
  const predictions = racePredictions(runs, today);
  if (predictions.every(p => p.seconds === null)) return null;
  const trend = paceTrend(runs, today);
  const faster = trend && trend.delta < 0;
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Previsão de prova')}</div>
      <div className="run-records">
        {predictions.map(p => (
          <div key={p.key} className="stat-card">
            <span className="stat-card__value">{p.seconds === null ? '–' : formatClock(p.seconds)}</span>
            <span className="stat-card__label">{p.label}</span>
          </div>
        ))}
      </div>
      <p className="profile-field__hint">{t('Estimativa pelas suas corridas dos últimos 90 dias. Quanto mais longa a corrida, mais confiável para as provas longas.')}</p>
      {trend && Math.abs(trend.delta) >= 1 && (
        <p className="run-trend">
          {faster
            ? t('📈 Ritmo médio de {v1}/km, {v2} s mais rápido que nas 4 semanas anteriores.', { v1: formatPace(trend.recent), v2: Math.abs(trend.delta) })
            : t('📉 Ritmo médio de {v1}/km, {v2} s mais lento que nas 4 semanas anteriores.', { v1: formatPace(trend.recent), v2: trend.delta })}
        </p>
      )}
    </div>
  );
}

const MONTHS = () => [t('jan'), t('fev'), t('mar'), t('abr'), t('mai'), t('jun'), t('jul'), t('ago'), t('set'), t('out'), t('nov'), t('dez')];

// Melhor tempo de 1, 5 ou 10 km em cada mês: a barra mais comprida é o melhor mês.
function EffortHistory({ runs, today }) {
  const [km, setKm] = useState(5);
  const hasAny = EFFORT_HISTORY_KM.some(k => effortHistory(runs, k, today).some(h => h.seconds !== null));
  if (!hasAny) return null;
  const history = effortHistory(runs, km, today);
  const times = history.map(h => h.seconds).filter(s => s !== null);
  const best = times.length ? Math.min(...times) : null;
  const names = MONTHS();
  const first = times.length > 1 ? history.find(h => h.seconds !== null).seconds : null;
  const last = [...history].reverse().find(h => h.seconds !== null)?.seconds ?? null;
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Evolução do melhor tempo')}</div>
      <div className="dash-card run-goals">
        <div className="run-chips">
          {EFFORT_HISTORY_KM.map(k => (
            <button key={k} type="button" aria-pressed={km === k} className={`run-chip${km === k ? ' run-chip--on' : ''}`} onClick={() => setKm(k)}>{k} km</button>
          ))}
        </div>
        {best === null ? (
          <p className="profile-field__hint">{t('Sem corrida com GPS de {v1} km ou mais nos últimos 6 meses.', { v1: km })}</p>
        ) : history.map(h => (
          <div key={h.month} className="run-goal">
            <div className="run-goal__head">
              <strong>{names[Number(h.month.slice(5)) - 1]}</strong>
              <span>{h.seconds === null ? '–' : formatClock(h.seconds)}</span>
            </div>
            <div className="run-goal__bar" role="img" aria-label={`${names[Number(h.month.slice(5)) - 1]}: ${h.seconds === null ? '–' : formatClock(h.seconds)}`}>
              <span style={{ width: h.seconds === null ? '0%' : `${Math.round((best / h.seconds) * 100)}%` }} />
            </div>
          </div>
        ))}
        {first !== null && last !== null && first !== last && (
          <p className="run-trend">
            {last < first
              ? t('📈 {v1} km: {v2} mais rápido que no primeiro mês com registro.', { v1: km, v2: formatClock(first - last) })
              : t('📉 {v1} km: {v2} mais lento que no primeiro mês com registro.', { v1: km, v2: formatClock(last - first) })}
          </p>
        )}
      </div>
    </div>
  );
}

const BAND_LABEL = {
  frio: () => ['🥶', t('Frio'), `≤ ${tempText(15)}`],
  ameno: () => ['🌤️', t('Ameno'), `${tempText(16)}–${tempText(27)}`],
  calor: () => ['🥵', t('Calor'), `≥ ${tempText(28)}`],
};

// Como o clima mexe no ritmo neste mês: só com corridas do mês que têm clima salvo (weatherInsights.js).
function WeatherPace({ runs, today }) {
  const w = weatherBands(monthRuns(runs, today), 1);
  if (!w) return null;
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Clima e ritmo do mês')}</div>
      <div className="dash-card run-wx">
        <p className="run-wx__avg">{w.total === 1
            ? t('1 corrida com clima neste mês · {v1}', { v1: tempText(w.avgTemp) })
            : t('{v1} corridas com clima neste mês · média de {v2}', { v1: w.total, v2: tempText(w.avgTemp) })}</p>
        <ul className="run-wx__list">
          {w.bands.map(b => {
            const [icon, name, range] = BAND_LABEL[b.key]();
            return (
              <li key={b.key} className={`run-wx__row${w.fastest === b.key ? ' run-wx__row--best' : ''}`}>
                <span aria-hidden="true">{icon}</span>
                <span className="run-wx__name">{name} <small>{range}</small></span>
                <span className="run-wx__runs">{t('{v1} corrida(s)', { v1: b.runs })}</span>
                <strong>{b.pace === null ? '–' : `${formatPace(b.pace)}/km`}</strong>
              </li>
            );
          })}
        </ul>
        {w.fastest
          ? <p className="profile-field__hint">{t('Você corre mais rápido na faixa destacada.')}</p>
          : <p className="profile-field__hint">{t('Com mais corridas em faixas diferentes, aparece em qual temperatura você corre mais rápido.')}</p>}
      </div>
    </div>
  );
}

function Achievements({ runs }) {
  const list = achievements(runs);
  const unlocked = list.filter(a => a.unlocked).length;
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Conquistas')} · {unlocked}/{list.length}</div>
      <ul className="run-badges">
        {list.map(a => (
          <li key={a.id} className={`run-badge${a.unlocked ? ' run-badge--on' : ''}`}>
            <span className="run-badge__icon" aria-hidden="true">{a.icon}</span>
            <span className="run-badge__title">{a.title}</span>
            <span className="run-badge__state">
              {a.unlocked ? t('Conquistada') : `${Math.floor(a.progress * 100)}%`}
            </span>
            {!a.unlocked && (
              <span className="run-badge__bar" aria-hidden="true"><span style={{ width: `${Math.floor(a.progress * 100)}%` }} /></span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RunInsights({ runs, meta }) {
  const today = todayDate();
  return (
    <>
      <Goals runs={runs} today={today} meta={meta} />
      <WeekLoad runs={runs} today={today} />
      <RunFitness runs={runs} today={today} />
      <Predictions runs={runs} today={today} />
      <EffortHistory runs={runs} today={today} />
      <WeatherPace runs={runs} today={today} />
      <MonthlyBadges runs={runs} today={today} />
      <Achievements runs={runs} />
    </>
  );
}
