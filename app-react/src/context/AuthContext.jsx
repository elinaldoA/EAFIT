import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { AuthContext } from './useAuth';
import { translateAuthError, isEmailNotConfirmed, isSpecificAuthError } from '../lib/authErrors';
import { trackAuthEvent } from '../lib/tracking';
import { claimLocalData, clearUserLocalData } from '../lib/localData';
import { isAdminAccount } from '../lib/adminGuard';
import { takeEmailLink } from '../lib/emailLink';

import { t, lang } from '../lib/i18n';
const MIN_PASSWORD = 6;

// Links de e-mail (confirmação de cadastro, redefinição de senha) voltam pra
// esta mesma página do app (ex.: https://eafit.com.br/app/), não pra Site URL raiz
// do projeto Supabase. A URL precisa estar em Authentication → URL
// Configuration → Redirect URLs no dashboard.
function appUrl() {
  return window.location.origin + window.location.pathname;
}

// E-mail de boas-vindas (melhor esforço). A função send-welcome só envia pra
// conta recém-criada e uma vez só, então chamar de novo não duplica.
async function sendWelcomeEmail() {
  try { await db.functions.invoke('send-welcome'); } catch { /* sem e-mail, o cadastro segue */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Aberto pelo link de "Esqueci minha senha": o Supabase já cria uma sessão
  // válida e dispara PASSWORD_RECOVERY — o Shell mostra a tela de nova senha
  // antes de liberar o app (mesmo padrão de app-admin/AdminAuthContext).
  const [recoveryMode, setRecoveryMode] = useState(false);
  // Link de e-mail que não valeu (expirado ou já usado): a tela de acesso
  // abre mostrando o motivo.
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    let active = true;

    // Conta de admin não usa o app (só o painel admin): derruba a sessão e
    // deixa a tela de acesso. Qualquer outra sessão segue o fluxo normal.
    async function acceptSession(session) {
      if (session && await isAdminAccount(session.user.id)) {
        await db.auth.signOut();
        if (active) { setUser(null); setAuthLoading(false); }
        return;
      }
      if (!active) return;
      if (session) claimLocalData(session.user.id);
      setUser(session ? session.user : null);
      setAuthLoading(false);
    }

    // Aberto por um link de e-mail (?token_hash=..., ver lib/emailLink.js):
    // troca o código pela sessão antes de olhar a sessão guardada. Dando certo,
    // o supabase-js dispara PASSWORD_RECOVERY/SIGNED_IN no listener abaixo.
    const link = takeEmailLink();
    const verified = link
      ? db.auth.verifyOtp(link)
        .then(({ error }) => {
          if (error) { if (active) setLinkError(translateAuthError(error)); return; }
          // Cadastro com confirmação por e-mail: a conta só passa a valer aqui.
          if (link.type === 'signup') sendWelcomeEmail();
        })
        .catch(err => console.error('verifyOtp:', err))
      : Promise.resolve();

    // Sem .catch(), uma falha aqui (comum logo após o reload forçado pelo
    // service worker no update do PWA, quando rede/sessão ainda estão se
    // reestabilizando) deixava authLoading travado em true pra sempre — e
    // como Shell só renderiza o app com authLoading=false, a tela (incluindo
    // o menu) sumia até fechar e reabrir o app.
    verified.then(() => db.auth.getSession())
      .then(({ data: { session } }) => acceptSession(session))
      .catch(err => {
        console.error('getSession:', err);
        if (active) setAuthLoading(false);
      });

    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      // Com link de e-mail, quem libera a tela é o getSession depois do
      // verifyOtp — senão a tela de acesso piscava antes da de nova senha.
      if (link && event === 'INITIAL_SESSION') return;
      if (!session) {
        if (event === 'SIGNED_OUT') clearUserLocalData();
        setUser(null);
        setAuthLoading(false);
        return;
      }
      // Fora do callback: o supabase-js não aceita chamadas dele dentro daqui.
      setTimeout(() => { acceptSession(session); }, 0);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function login(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      trackAuthEvent('login_error', isEmailNotConfirmed(error) ? 'email_not_confirmed' : error.code || 'outro');
      if (isEmailNotConfirmed(error)) return { error: translateAuthError(error), needsConfirmation: true };
      // Qualquer outra falha de credencial vira a mesma mensagem (não revela
      // se o e-mail existe); rede/limite de tentativas ganham texto próprio.
      return { error: isSpecificAuthError(error) ? translateAuthError(error) : t('E-mail ou senha inválidos.') };
    }
    if (await isAdminAccount(data.user.id)) {
      await db.auth.signOut();
      return { error: t('Esta conta é de administrador e acessa apenas o painel admin.') };
    }
    claimLocalData(data.user.id);
    setUser(data.user);
    return {};
  }

  async function signup(email, password) {
    if (password.length < MIN_PASSWORD) {
      trackAuthEvent('signup_error', 'senha_curta');
      return { error: t('Senha: mínimo {MIN_PASSWORD} caracteres.', { MIN_PASSWORD }) };
    }
    const { data, error } = await db.auth.signUp({
      email, password,
      options: { data: { termsAcceptedAt: new Date().toISOString(), lang }, emailRedirectTo: appUrl() },
    });
    if (error) {
      trackAuthEvent('signup_error', error.code || 'outro');
      return { error: translateAuthError(error) };
    }
    // Com proteção contra enumeração de e-mail ligada, cadastrar um e-mail que
    // já tem conta confirmada não dá erro — volta um usuário sem identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      trackAuthEvent('signup_error', 'user_already_exists');
      return { error: translateAuthError({ code: 'user_already_exists' }) };
    }
    trackAuthEvent('signup_ok');
    if (data.session) {
      claimLocalData(data.user.id);
      setUser(data.user);
      sendWelcomeEmail();
      return {};
    }
    return { success: t('Conta criada! Enviamos um link de confirmação para o seu e-mail.') };
  }

  async function requestPasswordReset(email) {
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    if (error) return { error: translateAuthError(error) };
    // Mesma resposta exista ou não a conta — não revela quais e-mails estão cadastrados.
    return { success: t('Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha.') };
  }

  async function resendConfirmation(email) {
    const { error } = await db.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl() } });
    if (error) return { error: translateAuthError(error) };
    return { success: t('Link de confirmação reenviado. Confira também a caixa de spam.') };
  }

  function finishRecovery() {
    setRecoveryMode(false);
  }

  async function logout() {
    await db.auth.signOut();
    clearUserLocalData();
    setUser(null);
  }

  async function updateProfile(fields) {
    const { data, error } = await db.auth.updateUser({ data: fields });
    if (!error && data?.user) setUser(data.user);
    return { error };
  }

  async function updateEmail(email) {
    const { error } = await db.auth.updateUser({ email }, { emailRedirectTo: appUrl() });
    return { error: error ? translateAuthError(error) : undefined };
  }

  async function updatePassword(password) {
    if (password.length < MIN_PASSWORD) return { error: t('Senha: mínimo {MIN_PASSWORD} caracteres.', { MIN_PASSWORD }) };
    const { error } = await db.auth.updateUser({ password });
    return { error: error ? translateAuthError(error) : undefined };
  }

  async function deleteAccount() {
    if (!user) return { error: t('Não autenticado.') };
    const { error } = await db.functions.invoke('delete-account');
    if (error) return { error: t('Não foi possível excluir a conta agora. Tente de novo em instantes.') };
    await db.auth.signOut();
    clearUserLocalData();
    setUser(null);
    return {};
  }

  return (
    <AuthContext.Provider value={{
      user, authLoading, recoveryMode, linkError,
      login, signup, logout, requestPasswordReset, resendConfirmation, finishRecovery,
      updateProfile, updateEmail, updatePassword, deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
