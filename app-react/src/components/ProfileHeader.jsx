import { getDisplayName } from '../lib/utils';
import { useSeason } from '../hooks/useSeason';

import { t, locale } from '../lib/i18n';
// runStats ({ week, streak, total }, já em texto) troca os números de treino pelos
// de corrida: km da semana (com a meta, se houver), semanas seguidas e km no total.
export default function ProfileHeader({ user, avatarData, uploadingAvatar, onAvatarChange, stats, weeklyGoalNum, runStats = null }) {
  const since = user ? new Date(user.created_at) : null;
  const { theme } = useSeason();

  return (
    <>
      <div className="profile-hero">
        <label className={`profile-avatar${avatarData ? ' profile-avatar--photo' : ''}`}>
          {avatarData
            ? <img src={avatarData} alt={t('Foto de perfil')} className="profile-avatar__img" />
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
            {since ? t('Membro desde {v1}', { v1: since.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) }) : '–'}
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-card__value">
            {runStats ? runStats.week : typeof stats.week === 'number' ? `${stats.week}/${weeklyGoalNum}` : stats.week}
          </span>
          <span className="stat-card__label">{runStats ? t('km esta semana') : t('Esta semana')}</span>
        </div>
        <div className="stat-card stat-card--streak">
          <span className="stat-card__value">{runStats ? runStats.streak : stats.streak}</span>
          <span className="stat-card__label">{theme === 'halloween' ? t('Sequência 🎃') : t('Sequência 🔥')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__value">{runStats ? runStats.total : stats.total}</span>
          <span className="stat-card__label">{runStats ? t('km no total') : t('Total treinos')}</span>
        </div>
      </div>
    </>
  );
}
