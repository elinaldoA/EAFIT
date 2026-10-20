import { db } from './supabase';

// Campanhas e origens (Análises → Campanhas): de onde vieram os cadastros e
// quanto ativaram. SQL em supabase/migrations/20261128140000_campaign_attribution.sql;
// a origem é guardada no app/landing por app-react/src/lib/attribution.js.

export const SOURCE_LABELS = {
  instagram: 'Instagram', facebook: 'Facebook', google: 'Google', tiktok: 'TikTok', youtube: 'YouTube',
  whatsapp: 'WhatsApp', x: 'X (Twitter)', linkedin: 'LinkedIn', bing: 'Bing', 'outro-site': 'Outro site',
  convite: 'Convite de amigo', card: 'Card de treino', sem_origem: 'Sem origem registrada',
};

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const key = (source, campaign) => `${source}|${campaign}`;

export function buildCampaigns(rows, costs) {
  const costBy = Object.fromEntries((costs || []).map(c => [key(c.source, c.campaign), Number(c.cost) || 0]));
  const items = (rows || []).map(r => {
    const signups = Number(r.ca_signups) || 0;
    const activated = Number(r.ca_activated) || 0;
    const visits = Number(r.ca_visits) || 0;
    const cost = costBy[key(r.ca_source, r.ca_campaign)] ?? null;
    return {
      key: key(r.ca_source, r.ca_campaign), source: r.ca_source, campaign: r.ca_campaign,
      label: SOURCE_LABELS[r.ca_source] || r.ca_source,
      visits, signups, confirmed: Number(r.ca_confirmed) || 0, activated, active30: Number(r.ca_active30) || 0,
      conversionPct: visits ? pct(signups, visits) : null,
      activationPct: pct(activated, signups),
      active30Pct: pct(Number(r.ca_active30) || 0, signups),
      cost,
      costPerSignup: cost && signups ? Math.round((cost / signups) * 100) / 100 : null,
      costPerActivated: cost && activated ? Math.round((cost / activated) * 100) / 100 : null,
    };
  });
  const sum = k => items.reduce((a, i) => a + (i[k] || 0), 0);
  const totalCost = items.reduce((a, i) => a + (i.cost || 0), 0);
  return {
    items,
    totals: {
      visits: sum('visits'), signups: sum('signups'), activated: sum('activated'), active30: sum('active30'),
      activationPct: pct(sum('activated'), sum('signups')), cost: totalCost,
      costPerActivated: totalCost && sum('activated') ? Math.round((totalCost / sum('activated')) * 100) / 100 : null,
    },
  };
}

export function formatMoney(v) {
  return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function fetchCampaigns(days = 30) {
  const [rows, costs] = await Promise.all([
    db.rpc('admin_campaign_attribution', { days_back: days }),
    db.from('campaign_costs').select('source, campaign, cost, notes'),
  ]);
  if (rows.error) throw rows.error;
  if (costs.error) throw costs.error;
  return buildCampaigns(rows.data, costs.data);
}

export async function saveCost(source, campaign, cost, adminId) {
  const value = Number(String(cost).replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) throw new Error('Valor inválido.');
  const { error } = await db.from('campaign_costs').upsert({
    source, campaign: campaign || '', cost: value, updated_at: new Date().toISOString(), updated_by: adminId,
  });
  if (error) throw error;
}
