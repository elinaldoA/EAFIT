import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { AdminAuthContext } from './useAdminAuth';
import { takeEmailLink } from '../lib/emailLink';
import { markStaffDevice } from '../lib/staffDevice';

// Só existe um papel aqui: super admin. O login usa o mesmo Supabase Auth do
// app do aluno — a diferença é que, depois de autenticar, checamos
// profiles.is_admin (liberado pela própria policy "vê seu próprio perfil")
// e derrubamos a sessão na hora se não for admin. Isso é só UX: a proteção
// de verdade é a policy "admin full access" (is_admin()) no banco e o check
// server-side na edge function admin-users.
//
// Segunda etapa obrigatória: além de is_admin, o painel só abre numa sessão
// aal2 (código do app autenticador confirmado). Até lá adminUser fica null e
// `mfa` diz qual tela mostrar no lugar do login: 'enroll' (primeiro acesso,
// com QR code) ou 'verify' (pede o código). O banco exige o mesmo — is_admin()
// e admin_can() só valem em aal2 —, então isto também é só UX.
const MFA_ISSUER = 'EAFIT Admin';

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
  const [mfa, setMfa] = useState(null);
  // Admin que passou da senha e espera a segunda etapa; e de quem a etapa já
  // foi aberta (os eventos de auth chegam repetidos e cada cadastro novo
  // trocaria o QR code na frente da pessoa).
  const pendingUser = useRef(null);
  const mfaOpenedFor = useRef(null);

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
        await requireSecondFactor(session.user);
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

  async function requireSecondFactor(user) {
    const { data, error } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!error && data?.currentLevel === 'aal2') {
      pendingUser.current = null;
      mfaOpenedFor.current = null;
      setMfa(null);
      markStaffDevice();
      setAdminUser(user);
      return;
    }
    setAdminUser(null);
    pendingUser.current = user;
    if (mfaOpenedFor.current === user.id) return;
    mfaOpenedFor.current = user.id;
    try {
      setMfa(await openSecondFactor());
    } catch (err) {
      console.error('mfa:', err);
      mfaOpenedFor.current = null;
      setMfa({ stage: 'error' });
    }
  }

  async function openSecondFactor() {
    const { data, error } = await db.auth.mfa.listFactors();
    if (error) throw error;
    const verified = data.totp.find(f => f.status === 'verified');
    if (verified) return { stage: 'verify', factorId: verified.id };

    // Cadastro que ficou pela metade (fechou a aba antes de confirmar o
    // código): descarta e começa de novo, senão o enroll recusa o nome repetido.
    for (const f of data.all) {
      if (f.factor_type === 'totp' && f.status !== 'verified') await db.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: enrolled, error: enrollErr } = await db.auth.mfa.enroll({
      factorType: 'totp', friendlyName: MFA_ISSUER, issuer: MFA_ISSUER,
    });
    if (enrollErr) throw enrollErr;
    return { stage: 'enroll', factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret };
  }

  async function verifySecondFactor(code) {
    if (!mfa?.factorId) return { error: 'Recomece o login.' };
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: mfa.factorId, code: code.replace(/\s/g, '') });
    if (error) return { error: 'Código inválido ou expirado. Confira se o relógio do celular está certo e tente de novo.' };
    const user = pendingUser.current;
    pendingUser.current = null;
    mfaOpenedFor.current = null;
    setMfa(null);
    markStaffDevice();
    setAdminUser(user);
    return {};
  }

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

    await requireSecondFactor(data.user);
    return {};
  }

  async function logout() {
    await db.auth.signOut();
    pendingUser.current = null;
    mfaOpenedFor.current = null;
    setMfa(null);
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
      mfa, verifySecondFactor,
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
