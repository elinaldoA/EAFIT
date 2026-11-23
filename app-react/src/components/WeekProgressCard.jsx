import { todayName } from '../data/treinoData';
import { fmtDate, daysUntil } from '../lib/utils';
import { fmtVolume } from '../lib/workoutHistory';
import { t, tFoco } from '../lib/i18n';

// Card "Semana atual": treinos feitos, faixa dos dias, volume e validade do ciclo.
export default function WeekProgressCard({ workDays, done, total, isDayDone, missedSet, volume, planStartDate, planEndDate, planExpired, planByTrainer }) {
  return (
    <div className="progress-card">
      <div className="progress-card__row">
        <span className="progress-card__label">{t('Semana atual')}</span>
        <span className="progress-card__count">{t('{done}/{total} treinos', { done, total })}</span>
      </div>
      <div className="week-strip">
        {workDays.map(d => {
          const isDone = isDayDone(d.dia);
          const isToday = d.dia === todayName();
          const isMissed = missedSet.has(d.dia);
          let status = '';
          if (isDone) status = t('(concluído)');
          else if (isMissed) status = t('(ficou para trás)');
          return (
            <div
              key={d.dia}
              className={`week-strip__day${isDone ? ' week-strip__day--done' : ''}${isToday ? ' week-strip__day--today' : ''}${isMissed ? ' week-strip__day--missed' : ''}`}
              title={`${t(d.dia)} — ${tFoco(d.foco)}${status}`}
            >
              <span className="week-strip__dot" aria-hidden="true">{isDone ? '✓' : ''}</span>
              <span className="week-strip__label">{t(d.dia).slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      {volume?.now > 0 && (
        <p className="progress-card__volume">
          {t('Volume da semana: {v}', { v: fmtVolume(volume.now) })}
          {volume.deltaPct != null && (
            <span className={volume.deltaPct >= 0 ? 'progress-card__delta--up' : 'progress-card__delta--down'}>
              {' · '}{t('{sinal}{pct}% vs. o mesmo ponto da semana passada', { sinal: volume.deltaPct > 0 ? '+' : '', pct: volume.deltaPct })}
            </span>
          )}
        </p>
      )}
      {planEndDate && !planExpired && (
        <p className="progress-card__cycle">
          {t('📅 Treino válido de {v1} até {v2} ({v3}d restantes){v4}', { v1: planStartDate ? fmtDate(planStartDate) : '—', v2: fmtDate(planEndDate), v3: Math.max(0, daysUntil(planEndDate)), v4: planByTrainer ? '' : ` · ${t('atualizado automaticamente ao vencer')}` })}
        </p>
      )}
    </div>
  );
}
