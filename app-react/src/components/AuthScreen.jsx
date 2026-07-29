import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import logoMark from '../assets/logo-mark.png';

export default function AuthScreen() {
  const { login, signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [busy, setBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) { setMsg({ text: 'Preencha e-mail e senha.', type: 'error' }); return; }
    setBusy(true);
    const { error } = await login(email.trim(), password);
    setBusy(false);
    setMsg(error ? { text: error, type: 'error' } : { text: '', type: '' });
  }

  async function handleSignup() {
    if (!email.trim() || !password) { setMsg({ text: 'Preencha e-mail e senha.', type: 'error' }); return; }
    setBusy(true);
    const { error, success } = await signup(email.trim(), password);
    setBusy(false);
    if (error) setMsg({ text: error, type: 'error' });
    else if (success) setMsg({ text: success, type: 'success' });
    else setMsg({ text: '', type: '' });
  }

  function onEnter(e) {
    if (e.key === 'Enter') handleLogin();
  }

  return (
    <div id="authScreen" className="auth-screen">
      <div className="auth-inner">
        <div className="auth-logo">
          <img className="auth-logo__icon" src={logoMark} alt="EAFIT" />
          <div className="auth-logo__name">EAFIT</div>
          <p className="auth-logo__tagline">Seu treino, sempre com você</p>
        </div>
        <div className="auth-form">
          <input
            type="email" className="input" placeholder="E-mail" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onEnter}
          />
          <input
            type="password" className="input" placeholder="Senha" autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onEnter}
          />
          <button className="btn btn--primary btn--full" disabled={busy} onClick={handleLogin}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <label className="auth-form__terms">
            <input
              type="checkbox" checked={acceptedTerms}
              onChange={e => setAcceptedTerms(e.target.checked)}
            />
            Li e aceito os <a href="legal/termos.html" target="_blank" rel="noopener noreferrer">Termos de Uso</a> e a{' '}
            <a href="legal/privacidade.html" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>
          </label>
          <button className="btn btn--outline btn--full" disabled={busy || !acceptedTerms} onClick={handleSignup}>
            {busy ? 'Criando…' : 'Criar conta'}
          </button>
          <p className={`auth-form__msg${msg.type ? ' auth-form__msg--' + msg.type : ''}`}>{msg.text}</p>
        </div>
      </div>
    </div>
  );
}
