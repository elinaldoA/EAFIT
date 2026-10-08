import { db } from './supabase';

// Link de descadastro do rodapé dos e-mails de resumo e novidades:
// https://eafit.com.br/app/?descadastro=<código>. Funciona sem login — o
// código é assinado pelo servidor e vale só pra conta que recebeu o e-mail
// (ver supabase/functions/email-unsubscribe).

// Devolve o código e tira da barra de endereço (não deve sobrar num recarregar).
export function takeUnsubscribeToken(win = window) {
  const url = new URL(win.location.href);
  const token = url.searchParams.get('descadastro');
  if (!token) return null;
  url.searchParams.delete('descadastro');
  win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
  return token;
}

export async function unsubscribeEmail(token) {
  try {
    const { data, error } = await db.functions.invoke('email-unsubscribe', { body: { token } });
    if (error || data?.error) return false;
  } catch {
    return false;
  }
  // Se a conta está logada neste aparelho, atualiza a sessão pra chave do
  // Perfil já aparecer desligada.
  try { await db.auth.refreshSession(); } catch { /* sem sessão: nada a atualizar */ }
  return true;
}
