// Converte em país/estado/cidade os IPs que o banco capturou das visitas e
// dos acessos ao app (fila geo_pending; ver
// supabase/migrations/20261105010000_visit_geo.sql). Chamada pelo pg_cron a
// cada 15 minutos (20261105020000_resolve_geo_cron.sql). Mesmo padrão de
// send-engagement: sem usuário logado, Verify JWT desativado, age via service
// role e só aceita o header x-cron-secret.
//
// Secret opcional IPINFO_TOKEN (regras do provedor em _shared/geoip.ts). No
// limite de consultas do provedor, para a rodada: o resto continua na fila.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAuthorizedCronRequest } from '../_shared/cronAuth.ts';
import { lookupIp } from '../_shared/geoip.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const IPINFO_TOKEN = Deno.env.get('IPINFO_TOKEN') || undefined;

const BATCH = 200;
const CONCURRENCY = 4;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (!isAuthorizedCronRequest(req, CRON_SECRET)) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabase.rpc('geo_pending', { max_rows: BATCH });
  if (error) return json({ error: error.message }, 500);
  const queue = ((data || []) as { ip: string }[]).map(r => r.ip);

  let located = 0;
  let notFound = 0;
  let stopped = false;

  async function worker() {
    while (!stopped && queue.length) {
      const ip = queue.shift()!;
      const r = await lookupIp(ip, IPINFO_TOKEN);
      if (r.kind === 'retry') { stopped = true; return; }
      const geo = r.kind === 'ok' ? r.geo : null;
      const { error: applyErr } = await supabase.rpc('geo_apply', {
        p_ip: ip, p_country: geo?.country ?? null, p_region: geo?.region ?? null,
        p_uf: geo?.uf ?? null, p_city: geo?.city ?? null,
      });
      if (applyErr) { console.error('geo_apply error:', applyErr.message); continue; }
      if (geo) located++; else notFound++;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return json({ located, notFound, left: queue.length, stopped });
});
