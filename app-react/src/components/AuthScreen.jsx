import { useEffect, useId, useState } from 'react';
import { useAuth } from '../context/useAuth';
import logoMark from '../assets/app-icon.png';
import PasswordInput from './PasswordInput';
import LanguageSwitch from './LanguageSwitch';
import { isKnownUser } from '../lib/knownUser';
import { recordVisit } from '../lib/pageVisits';
import { visibleInvite, fetchInviteName } from '../lib/trainerInvite';
import { trackAuthEvent } from '../lib/tracking';
import { t, lang } from '../lib/i18n';
import Wordmark from './Wordmark';

// Só o formato básico (algo@algo.algo); o resto o Supabase confere.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MODES = {
  // "Entrar" também é "participar" nos clubes/desafios (en/run.js traduz como
  // "Join"), então aqui o inglês vem direto em vez de passar pelo dicionário.
  login: lang === 'en'
    ? { title: 'Log in', submit: 'Log in', busy: 'Logging in…' }
    : { title: 'Entrar', submit: 'Entrar', busy: 'Entrando…' },
  signup: { title: t('Criar conta'), submit: t('Criar conta'), busy: t('Criando conta…') },
  forgot: { title: t('Recuperar senha'), submit: t('Enviar link'), busy: t('Enviando…') },
};

export default function AuthScreen() {
  const { login, loginWithGoogle, signup, requestPasswordReset, resendConfirmation, linkError } = useAuth();
  const emailId = useId();
  const [mode, setMode] = useState(() => (isKnownUser() ? 'login' : 'signup'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [msg, setMsg] = useState(() => (linkError ? { text: linkError, type: 'error' } : { text: '', type: '' }));
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleError, setGoogleError] = useState('');

  // Topo do funil do painel admin: quem chega aqui sem sessão.
  useEffect(() => { recordVisit('acesso'); }, []);

  // Chegou pelo link de convite de um personal: mostra quem convidou.
  const [inviter, setInviter] = useState('');
  useEffect(() => {
    const code = visibleInvite();
    if (!code) return undefined;
    let active = true;
    fetchInviteName(code).then(name => { if (active && name) setInviter(name); }).catch(() => { /* sem aviso */ });
    return () => { active = false; };
  }, []);

  // Começou a preencher o cadastro (1 vez por sessão; ver lib/tracking.js).
  useEffect(() => {
    if (mode === 'signup' && (email || password)) trackAuthEvent('signup_start');
  }, [mode, email, password]);

  function switchMode(next) {
    setMode(next);
    setMsg({ text: '', type: '' });
    setGoogleError('');
    setNeedsConfirmation(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanEmail = email.trim();
    const signingUp = mode === 'signup';
    if (signingUp) trackAuthEvent('signup_submit');
    if (!cleanEmail) {
      if (signingUp) trackAuthEvent('signup_error', 'sem_email');
      setMsg({ text: t('Informe seu e-mail.'), type: 'error' }); return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      if (signingUp) trackAuthEvent('signup_error', 'email_invalido');
      setMsg({ text: t('E-mail inválido.'), type: 'error' }); return;
    }
    if (mode !== 'forgot' && !password) {
      if (signingUp) trackAuthEvent('signup_error', 'sem_senha');
      setMsg({ text: t('Informe sua senha.'), type: 'error' }); return;
    }
    if (signingUp && !acceptedTerms) {
      trackAuthEvent('signup_error', 'termos');
      setMsg({ text: t('Aceite os Termos de Uso para criar a conta.'), type: 'error' }); return;
    }

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

  // Entrar e criar conta são o mesmo clique no Google; conta nova é criada lá.
  // Aceite dos Termos: na aba de cadastro, o checkbox (vale para e-mail e Google);
  // na de entrada, o aviso sob o botão. Gravado na primeira volta do Google.
  async function handleGoogle() {
    if (mode === 'signup' && !acceptedTerms) {
      trackAuthEvent('signup_error', 'termos');
      setGoogleError(t('Aceite os Termos de Uso para criar a conta.')); return;
    }
    setBusy(true);
    setGoogleError('');
    const result = await loginWithGoogle();
    // Deu certo: a página sai para o Google. Só volta aqui se falhar.
    setBusy(false);
    if (result.error) setGoogleError(result.error);
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
        {/* No topo: no fim da página ficava abaixo da dobra em celulares menores. */}
        <LanguageSwitch id="authLang" compact />
        <div className="auth-logo">
          <img className="auth-logo__icon" src={logoMark} alt="" />
          <h1 className="auth-logo__name"><Wordmark /></h1>
          <p className="auth-logo__tagline">{t('Seu treino, sempre com você')}</p>
          {inviter && (
            <p className="auth-invite">{t('🤝 {name} convidou você para treinar com acompanhamento. Crie sua conta (ou entre) para aceitar.', { name: inviter })}</p>
          )}
          {mode === 'signup' && !inviter && (
            <p className="auth-logo__pitch">
              {t('Plano de treino pro seu objetivo, registro de cada série e gráficos da sua evolução. Grátis e funciona offline.')}
            </p>
          )}
          <a className="auth-logo__more" href="../">{t('Conheça o app →')}</a>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode === 'forgot' ? (
            <div className="auth-form__intro">
              <h2 className="auth-form__title">{labels.title}</h2>
              <p className="auth-form__subtitle">{t('Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.')}</p>
            </div>
          ) : (
            <div className="auth-tabs" role="tablist" aria-label={t('Acesso')}>
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

          {mode === 'signup' && (
            <label className="auth-form__terms">
              <input type="checkbox" checked={acceptedTerms} onChange={e => { setAcceptedTerms(e.target.checked); setGoogleError(''); }} />
              <span>
                {t('Li e aceito os')} <a href="legal/termos.html" target="_blank" rel="noopener noreferrer">{t('Termos de Uso')}</a> {t('e a')}{' '}
                <a href="legal/privacidade.html" target="_blank" rel="noopener noreferrer">{t('Política de Privacidade')}</a>
              </span>
            </label>
          )}

          {mode !== 'forgot' && (
            <div className="auth-google-block">
              <button type="button" className="btn btn--outline btn--full auth-google" disabled={busy} onClick={handleGoogle}>
                <svg className="auth-google__icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                {t('Continuar com o Google')}
              </button>
              {mode === 'login' && (
                <p className="auth-form__legal">
                  {t('Ao continuar com o Google, você aceita os')} <a href="legal/termos.html" target="_blank" rel="noopener noreferrer">{t('Termos de Uso')}</a> {t('e a')}{' '}
                  <a href="legal/privacidade.html" target="_blank" rel="noopener noreferrer">{t('Política de Privacidade')}</a>.
                </p>
              )}
              {googleError && <p className="auth-form__msg auth-form__msg--error" role="alert">{googleError}</p>}
              <div className="auth-divider" role="separator"><span>{t('ou')}</span></div>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor={emailId}>{t('E-mail')}</label>
            <input
              id={emailId} type="email" className="input" inputMode="email"
              autoComplete={mode === 'signup' ? 'email' : 'username'} autoCapitalize="none" spellCheck={false}
              value={email} onChange={e => setEmail(e.target.value)} required
            />
          </div>

          {mode !== 'forgot' && (
            <PasswordInput
              key={mode}
              label={t('Senha')}
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 6 : undefined}
              hint={mode === 'signup' ? t('Mínimo de 8 caracteres.') : undefined}
            />
          )}

          {mode === 'login' && (
            <button type="button" className="auth-form__link auth-form__link--right" onClick={() => switchMode('forgot')}>
              {t('Esqueci minha senha')}
            </button>
          )}

          <button type="submit" className="btn btn--primary btn--full" disabled={busy}>
            {busy ? labels.busy : labels.submit}
          </button>

          <p className={`auth-form__msg${msg.type ? ' auth-form__msg--' + msg.type : ''}`} role="status" aria-live="polite">
            {msg.text}
          </p>

          {needsConfirmation && (
            <button type="button" className="btn btn--outline btn--full" disabled={busy} onClick={handleResend}>
              {t('Reenviar link de confirmação')}
            </button>
          )}

          {mode === 'forgot' && (
            <button type="button" className="auth-form__link" onClick={() => switchMode('login')}>
              {t('← Voltar para o login')}
            </button>
          )}
        </form>

      </div>
    </div>
  );
}
