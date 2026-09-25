import { getDisplayName } from '../lib/utils';

export default function ProfileHeader({ user, avatarData, uploadingAvatar, onAvatarChange, stats, weeklyGoalNum }) {
  const since = user ? new Date(user.created_at) : null;

  return (
    <>
      <div className="profile-hero">
        <label className={`profile-avatar${avatarData ? ' profile-avatar--photo' : ''}`}>
          {avatarData
            ? <img src={avatarData} alt="Foto de perfil" className="profile-avatar__img" />
            : (getDisplayName(user)?.[0]?.toUpperCase() || '?')}
          <span className="profile-avatar__edit">{uploadingAvatar ? '…' : '📷'}</span>
          <input type="file" accept="image/*" hidden disabled={uploadingAvatar} onChange={onAvatarChange} />
        </label>
        <div className="profile-hero__info">
          <div className="profile-email">{getDisplayName(user) || '–'}</div>
          {user?.email && user.email !== getDisplayName(user) && (
            <div className="profile-handle">{user.email}</div>
          )}
          <div className="profile-since">
            {since ? 'Membro desde ' + since.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '–'}
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-card__value">
            {typeof stats.week === 'number' ? `${stats.week}/${weeklyGoalNum}` : stats.week}
          </span>
          <span className="stat-card__label">Esta semana</span>
        </div>
        <div className="stat-card stat-card--streak">
          <span className="stat-card__value">{stats.streak}</span>
          <span className="stat-card__label">Sequência 🔥</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__value">{stats.total}</span>
          <span className="stat-card__label">Total treinos</span>
        </div>
      </div>
    </>
  );
}
