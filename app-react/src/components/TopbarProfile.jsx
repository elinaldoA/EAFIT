import { useAuth } from '../context/useAuth';
import { useAvatar } from '../context/useAvatar';
import { useWorkout } from '../context/useWorkout';
import { getDisplayName } from '../lib/utils';

const SYNC_TITLE = {
  ok: 'Sincronizado',
  loading: 'Sincronizando…',
  pending: 'Alterações pendentes — toque para sincronizar',
  error: 'Erro de sync — toque para tentar novamente',
};

export default function TopbarProfile() {
  const { user } = useAuth();
  const { avatarData } = useAvatar();
  const { syncStatus, syncNow } = useWorkout();
  const name = getDisplayName(user);
  const clickable = syncStatus === 'pending' || syncStatus === 'error';

  return (
    <div className="topbar__profile">
      <span className="topbar__avatar">
        {avatarData
          ? <img src={avatarData} alt="" className="topbar__avatar-img" />
          : (name?.[0]?.toUpperCase() || '?')}
      </span>
      <span className="topbar__name">{name}</span>
      {clickable ? (
        <button
          type="button" className={`sync-dot sync-dot--${syncStatus} sync-dot--clickable`}
          title={SYNC_TITLE[syncStatus]} onClick={syncNow}
        />
      ) : (
        <span className={`sync-dot sync-dot--${syncStatus}`} title={SYNC_TITLE[syncStatus] || ''} />
      )}
    </div>
  );
}
