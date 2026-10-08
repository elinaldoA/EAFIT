// Links dos e-mails de login (redefinição de senha, confirmação de cadastro,
// troca de e-mail) chegam como https://eafit.com.br/app/?token_hash=...&type=recovery
// (ver supabase/templates/). O link aponta pro próprio app, e não pro endereço
// do Supabase, pra não cair no spam; quem troca o código pela sessão é o
// AuthContext, com verifyOtp.
const TYPES = ['recovery', 'signup', 'email_change'];

// Devolve { token_hash, type } e tira os dois da barra de endereço (o código
// vale uma vez só; não deve sobrar no histórico nem num recarregar).
export function takeEmailLink(win = window) {
  const url = new URL(win.location.href);
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (!token_hash || !TYPES.includes(type)) return null;
  url.searchParams.delete('token_hash');
  url.searchParams.delete('type');
  win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
  return { token_hash, type };
}
