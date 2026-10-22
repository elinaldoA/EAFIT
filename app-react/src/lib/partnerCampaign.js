import { db } from './supabase';
import { ambassadorLink } from './links';
import { detectRef, detectPersonal } from './pageVisits';
import { trainerInviteLink } from './trainerInvite';

// Campanhas de parceiros (painel admin → Pessoas → Campanhas de parceiros):
// aparecem para embaixadores, influenciadores e personais com o link de cada
// um marcado com a campanha (&utm_campaign=<slug>). Banco em
// supabase/migrations/20261130020000_partner_campaigns.sql.
//
// Quem chega por um link de parceiro com campanha tem a campanha guardada por
// 30 dias (a mais recente vale) e ela vai no cadastro em
// user_metadata.partnerCampaign: é assim que o cadastro conta para a campanha.

const KEY = 'eafit_partner_campaign';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SLUG_RE = /^[a-z0-9-]{3,40}$/;

const cleanSlug = value => {
  const slug = String(value ?? '').trim().toLowerCase();
  return SLUG_RE.test(slug) ? slug : '';
};

// Chamado ao abrir o app: só conta campanha que veio num link de parceiro.
export function capturePartnerCampaign(search = window.location.search, now = Date.now()) {
  if (!detectRef(search) && !detectPersonal(search)) return;
  const slug = cleanSlug(new URLSearchParams(search || '').get('utm_campaign'));
  if (!slug) return;
  try { localStorage.setItem(KEY, JSON.stringify({ slug, at: now })); } catch { /* sem armazenamento */ }
}

// Slug ainda válido, ou ''.
export function pendingPartnerCampaign(now = Date.now()) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    const slug = cleanSlug(saved?.slug);
    if (slug && now - Number(saved.at) < TTL_MS) return slug;
  } catch { /* sem armazenamento ou valor inválido */ }
  return '';
}

export function clearPartnerCampaign() {
  try { localStorage.removeItem(KEY); } catch { /* sem armazenamento */ }
}

// Link do parceiro marcado com a campanha.
export function campaignLink(campaign, channel = '') {
  const base = campaign.linkKind === 'personal' ? trainerInviteLink(campaign.code) : ambassadorLink(campaign.code, channel);
  const url = new URL(base);
  url.searchParams.set('utm_campaign', campaign.slug);
  return url.toString();
}

// Texto sugerido com o link no lugar de {link} (ou no fim, se o texto não tiver).
export function campaignCaption(campaign) {
  const text = String(campaign.caption || '').trim();
  if (!text) return '';
  const link = campaignLink(campaign);
  return text.includes('{link}') ? text.split('{link}').join(link) : `${text}\n${link}`;
}

export function isEnded(campaign, today) {
  return !!campaign.endsOn && campaign.endsOn < today;
}

export async function fetchMyCampaigns() {
  const { data, error } = await db.rpc('my_partner_campaigns');
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.pc_id, slug: r.pc_slug, title: r.pc_title, description: r.pc_description || '',
    caption: r.pc_caption || '', goal: r.pc_goal || '', startsOn: r.pc_starts_on, endsOn: r.pc_ends_on || '',
    linkKind: r.pc_link_kind, code: r.pc_code,
    visits: Number(r.pc_visits) || 0, signups: Number(r.pc_signups) || 0,
  }));
}

// Material das campanhas (a policy de promo_materials só devolve o das
// campanhas que o parceiro pode ver).
export async function fetchCampaignMaterials(ids) {
  if (!ids.length) return [];
  const { data, error } = await db.from('promo_materials')
    .select('id, title, description, storage_path, file_name, mime_type, size_bytes, created_at, campaign_id')
    .in('campaign_id', ids)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// 'shared' | 'copied' | 'cancelled' | 'failed' — mesmo contrato de shareAmbassadorLink.
export async function shareCampaign(campaign) {
  const url = campaignLink(campaign);
  const caption = campaignCaption(campaign);
  if (navigator.share) {
    try {
      await navigator.share(caption ? { title: 'EAFIT', text: caption } : { title: 'EAFIT', url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(caption || url)) ? 'copied' : 'failed';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
