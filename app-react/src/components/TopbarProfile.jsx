import { useAuth } from '../context/useAuth';
import { useAvatar } from '../context/useAvatar';
import { useWorkout } from '../context/useWorkout';
import { getDisplayName } from '../lib/utils';

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
  const clickable = syncStatus === 'pending' || syncStatus === 'error';

  return (
    <div className="topbar__profile">
      <span className="topbar__avatar">
        {avatarData
          ? <img src={avatarData} alt="" className="topbar__avatar-img" />
          : (name?.[0]?.toUpperCase() || '?')}
      </span>
      <span className="topbar__who">
        <span className="topbar__name" title={name}>{subtitle ? String(name || '').split(' ')[0] : name}</span>
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
    </div>
  );
}
