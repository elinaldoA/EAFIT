import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { AuthContext } from './useAuth';
import { translateAuthError, isEmailNotConfirmed } from '../lib/authErrors';

const MIN_PASSWORD = 6;

// Links de e-mail (confirmação de cadastro, redefinição de senha) voltam pra
// esta mesma página do app (ex.: https://.../EAFIT/), não pra Site URL raiz
// do projeto Supabase. A URL precisa estar em Authentication → URL
// Configuration → Redirect URLs no dashboard.
function appUrl() {
  return window.location.origin + window.location.pathname;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Aberto pelo link de "Esqueci minha senha": o Supabase já cria uma sessão
  // válida e dispara PASSWORD_RECOVERY — o Shell mostra a tela de nova senha
  // antes de liberar o app (mesmo padrão de app-admin/AdminAuthContext).
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    // Sem .catch(), uma falha aqui (comum logo após o reload forçado pelo
    // service worker no update do PWA, quando rede/sessão ainda estão se
    // reestabilizando) deixava authLoading travado em true pra sempre — e
    // como Shell só renderiza o app com authLoading=false, a tela (incluindo
    // o menu) sumia até fechar e reabrir o app.
    db.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session ? session.user : null);
      })
      .catch(err => {
        console.error('getSession:', err);
      })
      .finally(() => setAuthLoading(false));

    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setUser(session ? session.user : null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      if (isEmailNotConfirmed(error)) return { error: translateAuthError(error), needsConfirmation: true };
      // Qualquer outra falha de credencial vira a mesma mensagem (não revela
      // se o e-mail existe); rede/limite de tentativas ganham texto próprio.
      const translated = translateAuthError(error);
      const specific = /conexão|Aguarde|suspensa/.test(translated);
      return { error: specific ? translated : 'E-mail ou senha inválidos.' };
    }
    setUser(data.user);
    return {};
  }

  async function signup(email, password) {
    if (password.length < MIN_PASSWORD) return { error: `Senha: mínimo ${MIN_PASSWORD} caracteres.` };
    const { data, error } = await db.auth.signUp({
      email, password,
      options: { data: { termsAcceptedAt: new Date().toISOString() }, emailRedirectTo: appUrl() },
    });
    if (error) return { error: translateAuthError(error) };
    // Com proteção contra enumeração de e-mail ligada, cadastrar um e-mail que
    // já tem conta confirmada não dá erro — volta um usuário sem identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { error: translateAuthError({ code: 'user_already_exists' }) };
    }
    if (data.session) {
      setUser(data.user);
      return {};
    }
    return { success: 'Conta criada! Enviamos um link de confirmação para o seu e-mail.' };
  }

  async function requestPasswordReset(email) {
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    if (error) return { error: translateAuthError(error) };
    // Mesma resposta exista ou não a conta — não revela quais e-mails estão cadastrados.
    return { success: 'Se houver uma conta com este e-mail, você vai receber um link para criar uma nova senha.' };
  }

  async function resendConfirmation(email) {
    const { error } = await db.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl() } });
    if (error) return { error: translateAuthError(error) };
    return { success: 'Link de confirmação reenviado. Confira também a caixa de spam.' };
  }

  function finishRecovery() {
    setRecoveryMode(false);
  }

  async function logout() {
    await db.auth.signOut();
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
    if (password.length < MIN_PASSWORD) return { error: `Senha: mínimo ${MIN_PASSWORD} caracteres.` };
    const { error } = await db.auth.updateUser({ password });
    return { error: error ? translateAuthError(error) : undefined };
  }

  async function deleteAccount() {
    if (!user) return { error: 'Não autenticado.' };
    const { error } = await db.functions.invoke('delete-account');
    if (error) return { error: 'Não foi possível excluir a conta agora. Tente de novo em instantes.' };
    await db.auth.signOut();
    setUser(null);
    return {};
  }

  return (
    <AuthContext.Provider value={{
      user, authLoading, recoveryMode,
      login, signup, logout, requestPasswordReset, resendConfirmation, finishRecovery,
      updateProfile, updateEmail, updatePassword, deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
