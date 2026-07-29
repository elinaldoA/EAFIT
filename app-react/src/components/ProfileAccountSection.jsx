import { useState } from 'react';
import { version as APP_VERSION } from '../../package.json';

const DELETE_CONFIRM_WORD = 'EXCLUIR';

export default function ProfileAccountSection({
  user, accountOpen, setAccountOpen,
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
      <div className="profile-section">
        <button
          type="button"
          className="profile-section__title"
          onClick={() => setAccountOpen(o => !o)}
        >
          Alterar e-mail / senha {accountOpen ? '▲' : '▼'}
        </button>
        {accountOpen && (
          <>
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="newEmail">Novo e-mail</label>
              <input
                type="email" id="newEmail" className="input input--sm" placeholder={user?.email}
                value={newEmail} onChange={e => setNewEmail(e.target.value)}
              />
              <button className="btn btn--outline btn--sm" onClick={onUpdateEmail}>Atualizar e-mail</button>
            </div>
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="newPassword">Nova senha</label>
              <input
                type="password" id="newPassword" className="input input--sm" placeholder="Mínimo 6 caracteres"
                value={newPassword} onChange={e => setNewPassword(e.target.value)}
              />
              <button className="btn btn--outline btn--sm" onClick={onUpdatePassword}>Atualizar senha</button>
            </div>
          </>
        )}
      </div>

      <button className="btn btn--outline btn--full" onClick={onLogout}>Sair da conta</button>

      {!deleteOpen ? (
        <button
          type="button" className="btn btn--ghost btn--full"
          onClick={() => setDeleteOpen(true)}
        >Excluir conta</button>
      ) : (
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="deleteConfirm">
            Isso apaga seus treinos e dados salvos e encerra a sessão — não pode ser desfeito. Digite <strong>{DELETE_CONFIRM_WORD}</strong> para confirmar.
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
            >Excluir permanentemente</button>
            <button
              type="button" className="btn btn--outline btn--sm"
              onClick={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}
            >Cancelar</button>
          </div>
        </div>
      )}

      <p className="app-version">EAFIT v{APP_VERSION}</p>
    </>
  );
}
