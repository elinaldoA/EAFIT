import { useAuth } from '../context/useAuth';
import { useAvatar } from '../context/useAvatar';
import { useWorkout } from '../context/useWorkout';
import { getDisplayName, greetingName, dayPeriod } from '../lib/utils';
import { useStreak } from '../hooks/useStreak';

import { t } from '../lib/i18n';
const SYNC_TITLE = {
  ok: 'Sincronizado',
  loading: 'Sincronizando…',
  pending: t('Alterações pendentes — toque para sincronizar'),
  error: t('Erro de sync — toque para tentar novamente'),
};

// `subtitle`: marca do módulo de esporte ("EAFIT · Run"), embaixo do nome —
// numa linha só, nome, módulo e botões não cabem no celular.
export default function TopbarProfile({ subtitle = '' }) {
  const { user } = useAuth();
  const { avatarData } = useAvatar();
  const { syncStatus, syncNow } = useWorkout();
  const name = getDisplayName(user);
  const streak = useStreak(user);
  const hello = { morning: t('Bom dia,'), afternoon: t('Boa tarde,'), night: t('Boa noite,') }[dayPeriod()];
  const clickable = syncStatus === 'pending' || syncStatus === 'error';

  return (
    <div className="topbar__profile">
      <span className="topbar__avatar">
        {avatarData
          ? <img src={avatarData} alt="" className="topbar__avatar-img" />
          : (name?.[0]?.toUpperCase() || '?')}
      </span>
      <span className="topbar__who">
        {!subtitle && name && <span className="topbar__hello">{hello}</span>}
        <span className="topbar__name" title={name}>{subtitle ? String(name || '').split(' ')[0] : greetingName(user)}</span>
        {subtitle && <span className="topbar__module module-brand">{subtitle}</span>}
      </span>
      {clickable ? (
        <button
          type="button" className={`sync-dot sync-dot--${syncStatus} sync-dot--clickable`}
          title={SYNC_TITLE[syncStatus]} onClick={syncNow}
        />
      ) : (
        <span className={`sync-dot sync-dot--${syncStatus}`} title={SYNC_TITLE[syncStatus] || ''} />
      )}
      {streak && streak.streak > 0 && (
        <span className="topbar__streak" title={t('Sequência de treinos')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
          {t('{n} dias', { n: streak.streak })}
        </span>
      )}
    </div>
  );
}
