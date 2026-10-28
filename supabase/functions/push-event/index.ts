// Recebe do service worker do app o aviso de que uma notificação push chegou
// ('received') ou foi tocada ('clicked'). Sem sessão, Verify JWT desativado: o
// service worker só tem o endpoint da própria inscrição push, e é ele que
// identifica a pessoa (public.push_event_record). Gravação em
// public.push_events; ver supabase/migrations/20261217010000_push_events.sql.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  let body: { endpoint?: unknown; campaign?: unknown; event?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response('Corpo inválido.', { status: 400, headers: corsHeaders });
  }
  const { endpoint, campaign, event } = body;
  if (typeof endpoint !== 'string' || endpoint.length > 2048
    || typeof campaign !== 'string' || !UUID.test(campaign)
    || (event !== 'received' && event !== 'clicked')) {
    return new Response('Dados inválidos.', { status: 400, headers: corsHeaders });
  }

  const { error } = await admin.rpc('push_event_record', { p_endpoint: endpoint, p_campaign: campaign, p_event: event });
  if (error) {
    console.error('push_event_record error:', error.message);
    return new Response('Erro ao registrar.', { status: 500, headers: corsHeaders });
  }
  return new Response(null, { status: 204, headers: corsHeaders });
});
