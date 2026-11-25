import { fmtDate, daysUntil } from '../lib/utils';
import { fmtVolume } from '../lib/workoutHistory';
import { MUSCLE_LABELS } from '../data/bodyMuscleMap';
import { t } from '../lib/i18n';

// Card "Semana atual": treinos feitos, volume, músculos e validade do ciclo (a faixa dos dias fica no topo, HomeHero).
export default function WeekProgressCard({ done, total, volume, planStartDate, planEndDate, planExpired, planByTrainer, muscles = [] }) {
  return (
    <div className="progress-card">
      <div className="progress-card__row">
        <span className="progress-card__label">{t('Semana atual')}</span>
        <span className="progress-card__count">{t('{done}/{total} treinos', { done, total })}</span>
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
      {muscles.length > 0 && (
        <p className="progress-card__muscles" aria-label={t('Séries da semana por músculo, abaixo da faixa de referência')}>
          <span className="progress-card__muscles-label">{t('Séries na semana:')}</span>
          {muscles.slice(0, 4).map(m => (
            <span key={m.muscle} className="progress-card__chip">{MUSCLE_LABELS[m.muscle]} {m.count}/{m.min}</span>
          ))}
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
