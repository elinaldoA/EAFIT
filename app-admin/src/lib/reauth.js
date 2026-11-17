import { db } from './supabase';

// Segunda conferência antes de ações destrutivas: o admin digita de novo o
// código do app autenticador (TOTP), mesmo já estando logado. Vale também para
// quem largou o computador aberto dentro dos 30 min de sessão.
export const REAUTH_FRESH_MS = 5 * 60 * 1000;

let lastOk = 0;
export function reauthIsFresh(now = Date.now()) { return now - lastOk < REAUTH_FRESH_MS; }
export function markReauthed(now = Date.now()) { lastOk = now; }
export function resetReauth() { lastOk = 0; }

export async function verifyMfaCode(code) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return { error: 'Digite os 6 números do aplicativo autenticador.' };
  try {
    const { data, error } = await db.auth.mfa.listFactors();
    if (error) throw error;
    const factor = data.totp.find(f => f.status === 'verified');
    if (!factor) return { error: 'Nenhum autenticador cadastrado nesta conta.' };
    const { error: vErr } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code: clean });
    if (vErr) return { error: 'Código inválido ou expirado. Confira o relógio do celular e tente de novo.' };
    markReauthed();
    return {};
  } catch {
    return { error: 'Não foi possível conferir o código agora. Tente de novo.' };
  }
}
