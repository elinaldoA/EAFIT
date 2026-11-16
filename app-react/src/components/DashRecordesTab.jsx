import { useAppConfig } from '../context/useAppConfig';
import { isFlagOn } from '../lib/appConfig';
import Skeleton from './Skeleton';
import { PRList } from './DashCharts';
import { DiscomfortHistory } from './DiscomfortWidgets';
import StrengthGoals from './StrengthGoals';
import { t } from '../lib/i18n';

// Aba "Recordes" da Evolução: metas de carga, maior carga por exercício,
// conquistas e o histórico de desconforto.
export default function DashRecordesTab({
  exercises, allTimeLogs, loading, loadingPR, onRefreshRecords, badges, unlockedBadges, badgesUnlocked, discomfortHistory,
}) {
  const { config } = useAppConfig();
  return (
    <>
    {isFlagOn(config.flags, 'metas_carga') && <StrengthGoals exercises={exercises} allTimeLogs={allTimeLogs} />}
    <div className="section-group">
      <div className="section-group__label">{t('Recordes pessoais')}</div>
      <div className="dash-card">
        <div className="dash-card__title-row">
          <div className="dash-card__title">{t('Maior carga por exercício')}</div>
          <button type="button" className="icon-btn" aria-label={t('Atualizar recordes')} disabled={loadingPR} onClick={onRefreshRecords}>
            ↻
          </button>
        </div>
        {loadingPR ? <Skeleton height={100} /> : <PRList logs={allTimeLogs} />}
      </div>
    </div>

    <div className="section-group">
      <div className="section-group__label">{t('Conquistas · {size} de {length}', { size: badgesUnlocked, length: badges.length })}</div>
      <div className="dash-card">
        <div className="badge-grid">
          {badges.map(b => {
            const unlocked = unlockedBadges.has(b.id);
            return (
              <div key={b.id} className={`badge-card${unlocked ? ' badge-card--unlocked' : ''}${b.season ? ' badge-card--seasonal' : ''}`} title={b.desc}>
                <span className="badge-card__emoji">{b.emoji}</span>
                <span className="badge-card__title">{b.title}</span>
                {!unlocked && <span className="badge-card__desc">{b.desc}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    <div className="section-group">
      <div className="section-group__label">{t('Desconforto')}</div>
      <div className="dash-card">
        <div className="dash-card__title">{t('Histórico de desconforto')}</div>
        {loading ? <Skeleton height={100} /> : <DiscomfortHistory reports={discomfortHistory} />}
      </div>
    </div>
    </>
  );
}
