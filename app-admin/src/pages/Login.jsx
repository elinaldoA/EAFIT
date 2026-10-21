import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import logoMark from '../assets/logo-mark.png';

// Segunda etapa, depois da senha (ver AdminAuthContext): no primeiro acesso
// cadastra o app autenticador pelo QR code; nos seguintes pede o código.
function SecondFactor() {
  const { mfa, verifySecondFactor, logout } = useAdminAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const enrolling = mfa.stage === 'enroll';

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await verifySecondFactor(code);
    if (error) {
      setError(error);
      setCode('');
    }
    setBusy(false);
  }

  if (mfa.stage === 'error') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img className="auth-card__logo" src={logoMark} alt="EAFIT" />
          <div className="auth-card__brand">Verificação em duas etapas</div>
          <p className="form-msg form-msg--error">Não foi possível abrir a verificação agora. Entre de novo em instantes.</p>
          <button type="button" className="btn btn--primary btn--full" onClick={logout}>Voltar ao login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img className="auth-card__logo" src={logoMark} alt="EAFIT" />
        <div className="auth-card__brand">Verificação em duas etapas</div>
        {enrolling ? (
          <>
            <p className="auth-card__subtitle">
              Obrigatória para o backoffice. Escaneie com um app autenticador (Google Authenticator,
              Microsoft Authenticator, 1Password…) e digite o código de 6 dígitos que aparecer.
            </p>
            <img className="auth-card__qr" src={mfa.qr} alt="QR code para o app autenticador" />
            <p className="auth-card__secret">
              Sem câmera? Digite a chave no app:<br /><code>{mfa.secret}</code>
            </p>
          </>
        ) : (
          <p className="auth-card__subtitle">Digite o código de 6 dígitos do seu app autenticador.</p>
        )}

        <label className="field">
          <span className="field__label">Código</span>
          <input
            className="input" required autoFocus inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}" maxLength={7}
            value={code} onChange={e => setCode(e.target.value)}
          />
        </label>

        {error && <p className="form-msg form-msg--error">{error}</p>}

        <button className="btn btn--primary btn--full" type="submit" disabled={busy}>
          {busy ? 'Conferindo…' : enrolling ? 'Ativar e entrar' : 'Entrar'}
        </button>
        <button type="button" className="btn btn--ghost btn--full" disabled={busy} onClick={logout}>
          Sair
        </button>
      </form>
    </div>
  );
}

export default function Login() {
  const { adminUser, login, requestPasswordReset, linkError, mfa } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(linkError || '');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  if (adminUser) return <Navigate to="/" replace />;
  if (mfa) return <SecondFactor />;

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    const { error } = await login(email, password);
    if (error) setError(error);
    setBusy(false);
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Preencha o e-mail acima antes de pedir o link de redefinição.');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    await requestPasswordReset(email);
    setInfo('Se esse e-mail tiver uma conta de admin, enviamos um link de redefinição de senha.');
    setBusy(false);
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img className="auth-card__logo" src={logoMark} alt="EAFIT" />
        <div className="auth-card__brand">EAFIT Admin</div>
        <p className="auth-card__subtitle">Acesso restrito ao backoffice</p>

        <label className="field">
          <span className="field__label">E-mail</span>
          <input
            className="input" type="email" required autoFocus
            value={email} onChange={e => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">Senha</span>
          <input
            className="input" type="password" required
            value={password} onChange={e => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="form-msg form-msg--error">{error}</p>}
        {info && <p className="form-msg form-msg--ok">{info}</p>}

        <button className="btn btn--primary btn--full" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" className="btn btn--ghost btn--full" disabled={busy} onClick={handleForgotPassword}>
          Esqueci minha senha
        </button>
      </form>
    </div>
  );
}
