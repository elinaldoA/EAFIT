import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import logoMark from '../assets/app-icon.png';
import PasswordInput from './PasswordInput';

import { t } from '../lib/i18n';
// Mostrada no lugar do app quando o usuário chega pelo link de "Esqueci minha
// senha" (evento PASSWORD_RECOVERY, ver AuthContext) — a sessão já está
// válida, falta só definir a senha nova.
export default function PasswordRecoveryScreen() {
  const { updatePassword, finishRecovery, logout } = useAuth();
  const showToast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError(t('As senhas não coincidem.')); return; }
    setBusy(true);
    setError('');
    const result = await updatePassword(password);
    setBusy(false);
    if (result.error) { setError(result.error); return; }
    showToast(t('✅ Senha alterada com sucesso'));
    finishRecovery();
  }

  async function handleCancel() {
    finishRecovery();
    await logout();
  }

  return (
    <div className="auth-screen">
      <div className="auth-inner">
        <div className="auth-logo">
          <img className="auth-logo__icon" src={logoMark} alt="" />
          <h1 className="auth-logo__name">EAFIT</h1>
        </div>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-form__intro">
            <h2 className="auth-form__title">{t('Crie uma nova senha')}</h2>
            <p className="auth-form__subtitle">{t('Escolha uma senha que você não usa em outros sites.')}</p>
          </div>
          <PasswordInput label={t('Nova senha')} value={password} onChange={setPassword} autoComplete="new-password" autoFocus minLength={6} hint={t('Mínimo de 6 caracteres.')} />
          <PasswordInput label={t('Confirmar nova senha')} value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={6} />
          <button type="submit" className="btn btn--primary btn--full" disabled={busy}>
            {busy ? t('Salvando…') : t('Salvar nova senha')}
          </button>
          <p className={`auth-form__msg${error ? ' auth-form__msg--error' : ''}`} role="status" aria-live="polite">{error}</p>
          <button type="button" className="auth-form__link" onClick={handleCancel}>{t('Cancelar e sair')}</button>
        </form>
      </div>
    </div>
  );
}
