// Autenticação das Edge Functions chamadas só pelo pg_cron (send-reminders,
// send-scheduled-broadcast). Elas rodam com Verify JWT desligado (não há
// usuário logado numa chamada interna do cron), então sem isto a URL pública
// aceitava chamada de qualquer um — bastava repetir a chamada no minuto de um
// lembrete pra disparar push duplicado pra todos os usuários.
//
// O cron manda o header `x-cron-secret` lido do Supabase Vault (ver
// supabase/migrations/20260925010000_cron_secret.sql); a função compara com o
// secret CRON_SECRET das Edge Functions. Sem CRON_SECRET configurado, recusa
// tudo (fail closed) em vez de voltar a ficar aberta.
export const CRON_SECRET_HEADER = 'x-cron-secret';

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function isAuthorizedCronRequest(req: Request, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false;
  const provided = req.headers.get(CRON_SECRET_HEADER);
  if (!provided) return false;
  return timingSafeEqual(provided, expectedSecret);
}
