import { db } from './supabase';

// Efeito das notificações (Comunicação → Resultados): para cada envio, quantos
// leram no sino, abriram o app e treinaram depois, comparado com quanto as
// mesmas pessoas treinavam nos 3 dias antes. SQL em
// supabase/migrations/20261128010000_admin_campaign_effect.sql.

export const ORIGIN_LABELS = { manual: 'Manual', auto: 'Automática' };
export const KIND_LABELS = { aviso: 'Aviso', influenciador: 'Recado aos influenciadores', embaixador: 'Recado aos embaixadores' };

const pct = (part, total) => (total ? Math.round((part / total) * 100) : null);

export function mapCampaign(r) {
  const sent = Number(r.ce_sent) || 0;
  const trained3 = Number(r.ce_trained3) || 0;
  const before3 = Number(r.ce_before3) || 0;
  return {
    key: r.ce_key,
    origin: r.ce_origin,
    kind: r.ce_kind,
    title: r.ce_title,
    body: r.ce_body,
    firstAt: r.ce_first_at,
    lastAt: r.ce_last_at,
    sent,
    received: null,
    clicked: null,
    receivedPct: null,
    clickedPct: null,
    read: Number(r.ce_read) || 0,
    app1: Number(r.ce_app1) || 0,
    trained1: Number(r.ce_trained1) || 0,
    trained3,
    before3,
    readPct: pct(Number(r.ce_read) || 0, sent),
    appPct: pct(Number(r.ce_app1) || 0, sent),
    trained1Pct: pct(Number(r.ce_trained1) || 0, sent),
    trained3Pct: pct(trained3, sent),
    before3Pct: pct(before3, sent),
    // Pontos percentuais a mais (ou a menos) de quem treinou nos 3 dias depois
    // em relação aos 3 dias antes.
    lift: sent ? pct(trained3, sent) - pct(before3, sent) : null,
  };
}

// Totais de um conjunto de envios (só soma; as taxas saem dos totais).
export function summarizeCampaigns(items) {
  const t = items.reduce((a, c) => ({
    sent: a.sent + c.sent, read: a.read + c.read, app1: a.app1 + c.app1,
    trained3: a.trained3 + c.trained3, before3: a.before3 + c.before3,
  }), { sent: 0, read: 0, app1: 0, trained3: 0, before3: 0 });
  return {
    ...t,
    campaigns: items.length,
    readPct: pct(t.read, t.sent),
    appPct: pct(t.app1, t.sent),
    trained3Pct: pct(t.trained3, t.sent),
    lift: t.sent ? pct(t.trained3, t.sent) - pct(t.before3, t.sent) : null,
  };
}

// Chegou/tocou (push_events, medido pelo service worker do app): só existe para
// envios manuais/agendados, que levam o id da campanha no push. Quem ainda usa
// o app antigo não é contado, então as taxas são um piso, não o total.
export function withPushEvents(items, events) {
  const byCampaign = new Map(events.map(e => [e.pe_campaign, e]));
  return items.map(c => {
    const e = byCampaign.get(c.key);
    if (!e) return c;
    const received = Number(e.pe_received) || 0;
    const clicked = Number(e.pe_clicked) || 0;
    return { ...c, received, clicked, receivedPct: pct(received, c.sent), clickedPct: pct(clicked, c.sent) };
  });
}

export async function fetchCampaignEffect(days = 30) {
  const [effect, events] = await Promise.all([
    db.rpc('admin_campaign_effect', { days_back: days }),
    // Se a medição ainda não existe no banco, o painel segue sem as colunas novas.
    db.rpc('admin_push_events', { days_back: days }),
  ]);
  if (effect.error) throw effect.error;
  return withPushEvents((effect.data || []).map(mapCampaign), events.error ? [] : events.data || []);
}
