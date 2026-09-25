import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { AuthContext } from './useAuth';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

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

    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      setUser(session ? session.user : null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) return { error: 'E-mail ou senha inválidos.' };
    setUser(data.user);
    return {};
  }

  async function signup(email, password) {
    if (password.length < 6) return { error: 'Senha: mínimo 6 caracteres.' };
    const { data, error } = await db.auth.signUp({
      email, password,
      options: { data: { termsAcceptedAt: new Date().toISOString() } },
    });
    if (error) return { error: error.message };
    if (data.session) {
      setUser(data.user);
      return {};
    }
    return { success: 'Conta criada! Verifique seu e-mail para ativar.' };
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
    const { error } = await db.auth.updateUser({ email });
    return { error: error?.message };
  }

  async function updatePassword(password) {
    if (password.length < 6) return { error: 'Senha: mínimo 6 caracteres.' };
    const { error } = await db.auth.updateUser({ password });
    return { error: error?.message };
  }

  async function deleteAccount() {
    if (!user) return { error: 'Não autenticado.' };
    const { error } = await db.functions.invoke('delete-account');
    if (error) return { error: error.message };
    await db.auth.signOut();
    setUser(null);
    return {};
  }

  return (
    <AuthContext.Provider value={{ user, authLoading, login, signup, logout, updateProfile, updateEmail, updatePassword, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}
