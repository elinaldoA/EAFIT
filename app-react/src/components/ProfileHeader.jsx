import { useSeason } from '../hooks/useSeason';

import { t } from '../lib/i18n';
// runStats ({ week, streak, total }, já em texto) troca os números de treino pelos
// de corrida: km da semana (com a meta, se houver), semanas seguidas e km no total.
// onAvatarChange: com ele, o avatar vira o jeito de trocar a foto (antes ficava dentro de Dados pessoais).
export default function ProfileHeader({ stats, weeklyGoalNum, runStats = null, name = '', avatar = null, subtitle = '', onAvatarChange = null, uploadingAvatar = false }) {
  const { theme } = useSeason();

  // Com o nome, os números moram dentro de um cartão com o avatar (visual do perfil).
  const Wrap = 'div';
  return (
    <Wrap className={name ? 'profile-hero' : undefined}>
      {name && (
        <div className="profile-hero__who">
          <label className="profile-hero__avatar-wrap" aria-label={onAvatarChange ? t('Trocar foto de perfil') : undefined}>
            <span className="profile-hero__avatar" aria-hidden="true">
              {avatar ? <img src={avatar} alt="" /> : (name[0] || '?').toUpperCase()}
            </span>
            {onAvatarChange && (
              <>
                <span className="profile-hero__avatar-edit" aria-hidden="true">{uploadingAvatar ? '…' : '📷'}</span>
                <input type="file" accept="image/*" hidden disabled={uploadingAvatar} onChange={onAvatarChange} />
              </>
            )}
          </label>
          <span className="profile-hero__name">{name}</span>
          {subtitle && <span className="profile-hero__sub">{subtitle}</span>}
        </div>
      )}
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
    </Wrap>
  );
}
