import { useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';

export default function Profile() {
  const { adminUser, updateProfile, updatePassword, logout } = useAdminAuth();
  const md = adminUser?.user_metadata || {};

  const [nome, setNome] = useState(md.nome || '');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSaveProfile(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const { error } = await updateProfile({ nome });
    setMsg(error ? `Erro: ${error}` : 'Perfil atualizado.');
    setBusy(false);
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    if (!newPassword) return;
    setBusy(true);
    setMsg('');
    const { error } = await updatePassword(newPassword);
    setMsg(error ? `Erro: ${error}` : 'Senha atualizada.');
    if (!error) setNewPassword('');
    setBusy(false);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Meu perfil</h1>
      </div>

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      <form className="card form-grid" onSubmit={handleSaveProfile}>
        <label className="field">
          <span className="field__label">E-mail</span>
          <input className="input" value={adminUser?.email || ''} disabled />
        </label>
        <label className="field">
          <span className="field__label">Nome</span>
          <input className="input" value={nome} onChange={e => setNome(e.target.value)} />
        </label>
        <div className="form-grid__actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>Salvar perfil</button>
        </div>
      </form>

      <form className="card form-grid" onSubmit={handleUpdatePassword} style={{ marginTop: 16 }}>
        <label className="field">
          <span className="field__label">Nova senha</span>
          <input
            className="input" type="password" placeholder="Mínimo 6 caracteres"
            value={newPassword} onChange={e => setNewPassword(e.target.value)}
          />
        </label>
        <div className="form-grid__actions">
          <button className="btn btn--primary" type="submit" disabled={busy || !newPassword}>Atualizar senha</button>
        </div>
      </form>

      <button className="btn btn--ghost" style={{ marginTop: 16 }} onClick={logout}>Sair</button>
    </div>
  );
}
