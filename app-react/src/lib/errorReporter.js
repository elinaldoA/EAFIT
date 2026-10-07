import { db } from './supabase';

// Envia erros do navegador para a tabela client_errors (lida no painel/SQL do
// admin). Sem isso, falhas só aparecem para quem usa, no console. É "melhor
// esforço": nunca lança, não reenvia o mesmo erro e para depois de poucos por
// sessão, pra um loop de erro não virar uma enxurrada de requests.
const MAX_PER_SESSION = 10;
const seen = new Set();
let sent = 0;

function clip(value, max) {
  const s = value == null ? '' : String(value);
  return s.length > max ? s.slice(0, max) : s;
}

export async function reportError(kind, error) {
  try {
    const message = clip(error?.message || error, 500);
    if (!message) return;
    const key = `${kind}:${message}`;
    if (seen.has(key) || sent >= MAX_PER_SESSION) return;
    seen.add(key);
    sent++;

    const { data } = await db.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) return; // só usuário logado grava (RLS)

    await db.from('client_errors').insert({
      user_id: userId,
      kind,
      message,
      stack: clip(error?.stack, 2000) || null,
      url: clip(window.location.pathname + window.location.hash, 300),
    });
  } catch {
    /* relatar erro nunca pode causar outro erro */
  }
}

export function installErrorReporter() {
  window.addEventListener('error', e => reportError('error', e.error || e.message));
  window.addEventListener('unhandledrejection', e => reportError('unhandledrejection', e.reason));
}
