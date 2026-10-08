import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { AdminAuthContext } from './useAdminAuth';
import { takeEmailLink } from '../lib/emailLink';

// Só existe um papel aqui: super admin. O login usa o mesmo Supabase Auth do
// app do aluno — a diferença é que, depois de autenticar, checamos
// profiles.is_admin (liberado pela própria policy "vê seu próprio perfil")
// e derrubamos a sessão na hora se não for admin. Isso é só UX: a proteção
// de verdade é a policy "admin full access" (is_admin()) no banco e o check
// server-side na edge function admin-users.
export function AdminAuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Supabase detecta o token de recuperação de senha na URL sozinho e dispara
  // o evento PASSWORD_RECOVERY com uma sessão já válida — a gente intercepta
  // aqui pra travar o app na tela de "definir nova senha" antes de deixar o
  // usuário navegar normalmente com essa sessão.
  const [recoveryMode, setRecoveryMode] = useState(false);
  // Link de e-mail que não valeu (expirado ou já usado): o login abre
  // mostrando o motivo.
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    let active = true;

    async function resolveSession(session) {
      if (!session) {
        if (active) setAdminUser(null);
        return;
      }
      const isAdmin = await checkIsAdmin(session.user.id);
      if (!active) return;
      if (isAdmin) {
        setAdminUser(session.user);
      } else {
        setAdminUser(null);
        await db.auth.signOut();
      }
    }

    // Aberto pelo link do e-mail (?token_hash=..., ver lib/emailLink.js): troca
    // o código pela sessão antes de olhar a sessão guardada. Dando certo, o
    // supabase-js dispara PASSWORD_RECOVERY no listener abaixo.
    const link = takeEmailLink();
    const verified = link
      ? db.auth.verifyOtp(link)
        .then(({ error }) => { if (error && active) setLinkError('Este link expirou ou já foi usado. Peça um novo.'); })
        .catch(err => console.error('verifyOtp:', err))
      : Promise.resolve();

    verified.then(() => db.auth.getSession())
      .then(({ data: { session } }) => resolveSession(session))
      .catch(err => console.error('getSession:', err))
      .finally(() => { if (active) setAuthLoading(false); });

    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      // Com link de e-mail, quem libera a tela é o getSession depois do
      // verifyOtp — senão o login piscava antes da tela de nova senha.
      if (link && event === 'INITIAL_SESSION') return;
      resolveSession(session).finally(() => { if (active) setAuthLoading(false); });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function checkIsAdmin(userId) {
    const { data, error } = await db.from('profiles').select('is_admin').eq('id', userId).single();
    return !error && data?.is_admin === true;
  }

  async function login(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) return { error: 'E-mail ou senha inválidos.' };

    const isAdmin = await checkIsAdmin(data.user.id);
    if (!isAdmin) {
      await db.auth.signOut();
      return { error: 'Esta conta não tem acesso ao backoffice.' };
    }

    setAdminUser(data.user);
    return {};
  }

  async function logout() {
    await db.auth.signOut();
    setAdminUser(null);
  }

  async function updateProfile(fields) {
    const { data, error } = await db.auth.updateUser({ data: fields });
    if (!error && data?.user) setAdminUser(data.user);
    return { error: error?.message };
  }

  async function updatePassword(password) {
    if (password.length < 6) return { error: 'Senha: mínimo 6 caracteres.' };
    const { error } = await db.auth.updateUser({ password });
    return { error: error?.message };
  }

  async function requestPasswordReset(email) {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    return { error: error?.message };
  }

  function finishRecovery() {
    setRecoveryMode(false);
  }

  return (
    <AdminAuthContext.Provider value={{
      adminUser, authLoading, login, logout, updateProfile, updatePassword,
      recoveryMode, requestPasswordReset, finishRecovery, linkError,
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
