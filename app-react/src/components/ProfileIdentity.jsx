import { getDisplayName } from '../lib/utils';

import { t, locale } from '../lib/i18n';
// Foto, e-mail e data de cadastro. Mora dentro de Perfil → Dados pessoais; o
// nome já aparece na barra superior, então não se repete aqui.
export default function ProfileIdentity({ user, avatarData, uploadingAvatar, onAvatarChange }) {
  const since = user ? new Date(user.created_at) : null;

  return (
    <div className="profile-hero">
      <label className={`profile-avatar${avatarData ? ' profile-avatar--photo' : ''}`}>
        {avatarData
          ? <img src={avatarData} alt={t('Foto de perfil')} className="profile-avatar__img" />
          : (getDisplayName(user)?.[0]?.toUpperCase() || '?')}
        <span className="profile-avatar__edit">{uploadingAvatar ? '…' : '📷'}</span>
        <input type="file" accept="image/*" hidden disabled={uploadingAvatar} onChange={onAvatarChange} />
      </label>
      <div className="profile-hero__info">
        <div className="profile-email">{user?.email || '–'}</div>
        <div className="profile-since">
          {since ? t('Membro desde {v1}', { v1: since.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) }) : '–'}
        </div>
      </div>
    </div>
  );
}
