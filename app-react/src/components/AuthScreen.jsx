import { useId, useState } from 'react';
import { useAuth } from '../context/useAuth';
import logoMark from '../assets/app-icon.png';
import PasswordInput from './PasswordInput';

const MODES = {
  login: { title: 'Entrar', submit: 'Entrar', busy: 'Entrando…' },
  signup: { title: 'Criar conta', submit: 'Criar conta', busy: 'Criando conta…' },
  forgot: { title: 'Recuperar senha', submit: 'Enviar link', busy: 'Enviando…' },
};

export default function AuthScreen() {
  const { login, signup, requestPasswordReset, resendConfirmation } = useAuth();
  const emailId = useId();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);

  function switchMode(next) {
    setMode(next);
    setMsg({ text: '', type: '' });
    setNeedsConfirmation(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) { setMsg({ text: 'Informe seu e-mail.', type: 'error' }); return; }
    if (mode !== 'forgot' && !password) { setMsg({ text: 'Informe sua senha.', type: 'error' }); return; }
    if (mode === 'signup' && !acceptedTerms) { setMsg({ text: 'Aceite os Termos de Uso para criar a conta.', type: 'error' }); return; }

    setBusy(true);
    setNeedsConfirmation(false);
    let result;
    if (mode === 'login') result = await login(cleanEmail, password);
    else if (mode === 'signup') result = await signup(cleanEmail, password);
    else result = await requestPasswordReset(cleanEmail);
    setBusy(false);

    if (result.error) {
      setMsg({ text: result.error, type: 'error' });
      setNeedsConfirmation(!!result.needsConfirmation);
    } else if (result.success) {
      setMsg({ text: result.success, type: 'success' });
    } else {
      setMsg({ text: '', type: '' });
    }
  }

  async function handleResend() {
    setBusy(true);
    const result = await resendConfirmation(email.trim());
    setBusy(false);
    setMsg(result.error ? { text: result.error, type: 'error' } : { text: result.success, type: 'success' });
    if (!result.error) setNeedsConfirmation(false);
  }

  const labels = MODES[mode];

  return (
    <div id="authScreen" className="auth-screen">
      <div className="auth-inner">
        <div className="auth-logo">
          <img className="auth-logo__icon" src={logoMark} alt="" />
          <h1 className="auth-logo__name">EAFIT</h1>
          <p className="auth-logo__tagline">Seu treino, sempre com você</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode === 'forgot' ? (
            <div className="auth-form__intro">
              <h2 className="auth-form__title">{labels.title}</h2>
              <p className="auth-form__subtitle">Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
            </div>
          ) : (
            <div className="auth-tabs" role="tablist" aria-label="Acesso">
              {['login', 'signup'].map(key => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  className={`auth-tabs__tab${mode === key ? ' auth-tabs__tab--active' : ''}`}
                  onClick={() => switchMode(key)}
                >
                  {MODES[key].title}
                </button>
              ))}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor={emailId}>E-mail</label>
            <input
              id={emailId} type="email" className="input" inputMode="email"
              autoComplete={mode === 'signup' ? 'email' : 'username'} autoCapitalize="none" spellCheck={false}
              value={email} onChange={e => setEmail(e.target.value)} required
            />
          </div>

          {mode !== 'forgot' && (
            <PasswordInput
              key={mode}
              label="Senha"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 6 : undefined}
              hint={mode === 'signup' ? 'Mínimo de 6 caracteres.' : undefined}
            />
          )}

          {mode === 'login' && (
            <button type="button" className="auth-form__link auth-form__link--right" onClick={() => switchMode('forgot')}>
              Esqueci minha senha
            </button>
          )}

          {mode === 'signup' && (
            <label className="auth-form__terms">
              <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} />
              <span>
                Li e aceito os <a href="legal/termos.html" target="_blank" rel="noopener noreferrer">Termos de Uso</a> e a{' '}
                <a href="legal/privacidade.html" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>
              </span>
            </label>
          )}

          <button type="submit" className="btn btn--primary btn--full" disabled={busy}>
            {busy ? labels.busy : labels.submit}
          </button>

          <p className={`auth-form__msg${msg.type ? ' auth-form__msg--' + msg.type : ''}`} role="status" aria-live="polite">
            {msg.text}
          </p>

          {needsConfirmation && (
            <button type="button" className="btn btn--outline btn--full" disabled={busy} onClick={handleResend}>
              Reenviar link de confirmação
            </button>
          )}

          {mode === 'forgot' && (
            <button type="button" className="auth-form__link" onClick={() => switchMode('login')}>
              ← Voltar para o login
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
