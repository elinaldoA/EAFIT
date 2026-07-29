import { useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import logoMark from '../assets/logo-mark.png';

// Renderizada no lugar do resto do app enquanto recoveryMode estiver ativo —
// ver App.jsx. Não é uma rota do HashRouter de propósito: o link de
// recuperação do Supabase também usa fragmento de URL (#access_token=...),
// que colidiria com o roteamento por hash se isso fosse uma <Route/>.
export default function ResetPassword() {
  const { updatePassword, finishRecovery } = useAdminAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    setError('');
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) { setError(error); return; }
    finishRecovery();
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img className="auth-card__logo" src={logoMark} alt="EAFIT" />
        <div className="auth-card__brand">EAFIT Admin</div>
        <p className="auth-card__subtitle">Defina sua nova senha</p>

        <label className="field">
          <span className="field__label">Nova senha</span>
          <input
            className="input" type="password" required autoFocus minLength={6}
            value={password} onChange={e => setPassword(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">Confirmar nova senha</span>
          <input
            className="input" type="password" required minLength={6}
            value={confirm} onChange={e => setConfirm(e.target.value)}
          />
        </label>

        {error && <p className="form-msg form-msg--error">{error}</p>}

        <button className="btn btn--primary btn--full" type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  );
}
