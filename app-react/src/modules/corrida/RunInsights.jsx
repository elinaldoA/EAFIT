import { todayDate } from '../../data/treinoData';
import { formatKm, formatClock, formatPace } from './runs';
import { achievements, weeklyLoad, weekEffort, racePredictions, paceTrend, goalProgress } from './runReadings';
import { kmGoals } from './runProfileStats';
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
      <Predictions runs={runs} today={today} />
      <Achievements runs={runs} />
    </>
  );
}
