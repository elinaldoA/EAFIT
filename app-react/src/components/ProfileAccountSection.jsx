import { useState } from 'react';
import { version as APP_VERSION } from '../../package.json';
import CollapsibleCard from './CollapsibleCard';

import { t } from '../lib/i18n';
const DELETE_CONFIRM_WORD = t('EXCLUIR');

export default function ProfileAccountSection({
  user,
  newEmail, setNewEmail, onUpdateEmail,
  newPassword, setNewPassword, onUpdatePassword,
  onLogout, onDeleteAccount,
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  function handleConfirmDelete() {
    if (deleteConfirmText.trim().toUpperCase() !== DELETE_CONFIRM_WORD) return;
    onDeleteAccount();
    setDeleteOpen(false);
    setDeleteConfirmText('');
  }

  return (
    <>
      <CollapsibleCard icon="🔐" title={t('E-mail e senha')} summary={user?.email}>
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="newEmail">{t('Novo e-mail')}</label>
              <input
                type="email" id="newEmail" className="input input--sm" placeholder={user?.email}
                value={newEmail} onChange={e => setNewEmail(e.target.value)}
              />
              <button className="btn btn--outline btn--sm" onClick={onUpdateEmail}>{t('Atualizar e-mail')}</button>
            </div>
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="newPassword">{t('Nova senha')}</label>
              <input
                type="password" id="newPassword" className="input input--sm" placeholder={t('Mínimo 6 caracteres')}
                value={newPassword} onChange={e => setNewPassword(e.target.value)}
              />
              <button className="btn btn--outline btn--sm" onClick={onUpdatePassword}>{t('Atualizar senha')}</button>
            </div>
      </CollapsibleCard>

      <button className="btn btn--outline btn--full" onClick={onLogout}>{t('Sair da conta')}</button>

      {!deleteOpen ? (
        <button
          type="button" className="link-btn link-btn--danger"
          onClick={() => setDeleteOpen(true)}
        >{t('Excluir minha conta')}</button>
      ) : (
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="deleteConfirm">
            {t('Isso apaga seus treinos e dados salvos e encerra a sessão — não pode ser desfeito. Digite')} <strong>{DELETE_CONFIRM_WORD}</strong> {t('para confirmar.')}
          </label>
          <input
            type="text" id="deleteConfirm" className="input input--sm"
            value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
            placeholder={DELETE_CONFIRM_WORD} autoComplete="off"
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button" className="btn btn--danger btn--sm"
              disabled={deleteConfirmText.trim().toUpperCase() !== DELETE_CONFIRM_WORD}
              onClick={handleConfirmDelete}
            >{t('Excluir permanentemente')}</button>
            <button
              type="button" className="btn btn--outline btn--sm"
              onClick={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}
            >{t('Cancelar')}</button>
          </div>
        </div>
      )}

      <p className="app-version">{t('EAFIT v{APP_VERSION}', { APP_VERSION })}</p>
    </>
  );
}
