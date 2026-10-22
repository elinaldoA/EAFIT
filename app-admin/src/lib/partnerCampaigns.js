import { db } from './supabase';
import { uploadPromoMaterial } from './promoMaterials';
import { MESSAGE_BODY_MAX, MESSAGE_TITLE_MAX } from './ambassadors';

// Campanhas de parceiros (Pessoas → Campanhas de parceiros): a equipe cria,
// publica e elas aparecem no app de embaixadores, influenciadores e personais,
// cada um com o próprio link marcado com a campanha (&utm_campaign=<slug>).
// Banco em supabase/migrations/20261130020000_partner_campaigns.sql; o app
// mostra em app-react/src/components/PartnerCampaignsCard.jsx.

export const AUDIENCES = [
  { key: 'embaixador', label: 'Embaixadores' },
  { key: 'influenciador', label: 'Influenciadores' },
  { key: 'personal', label: 'Personais' },
];
export const audienceLabel = key => AUDIENCES.find(a => a.key === key)?.label || key;
export const KIND_LABELS = { embaixador: 'Embaixador', influenciador: 'Influenciador', personal: 'Personal' };

export const TITLE_MAX = 80;
export const TEXT_MAX = 1000;
export const GOAL_MAX = 200;
const SLUG_RE = /^[a-z0-9-]{3,40}$/;

// "Verão 2026: traga 1 amigo!" → "verao-2026-traga-1-amigo"
export function slugify(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

export function todaySp(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

// rascunho | agendada | ativa | encerrada
export function campaignStatus(c, today = todaySp()) {
  if (!c.published_at) return 'rascunho';
  if (c.starts_on > today) return 'agendada';
  if (c.ends_on && c.ends_on < today) return 'encerrada';
  return 'ativa';
}
export const STATUS = {
  rascunho: { label: 'Rascunho', badge: '' },
  agendada: { label: 'Agendada', badge: 'badge--warning' },
  ativa: { label: 'No ar', badge: 'badge--ok' },
  encerrada: { label: 'Encerrada', badge: 'badge--danger' },
};

export function emptyDraft(today = todaySp()) {
  return { id: null, title: '', slug: '', slugTouched: false, description: '', caption: '', goal: '', audiences: ['embaixador', 'influenciador', 'personal'], startsOn: today, endsOn: '', published: false };
}

export function draftFrom(c) {
  return {
    id: c.id, title: c.title, slug: c.slug, slugTouched: true, description: c.description || '', caption: c.caption || '',
    goal: c.goal || '', audiences: c.audiences || [], startsOn: c.starts_on, endsOn: c.ends_on || '', published: !!c.published_at,
  };
}

// '' = ok; senão, o problema em português.
export function validateDraft(d) {
  if (!d.title.trim()) return 'Dê um título para a campanha.';
  if (!SLUG_RE.test(d.slug)) return 'O endereço precisa ter de 3 a 40 letras minúsculas, números ou hífens.';
  if (!d.audiences.length) return 'Escolha para quem é a campanha.';
  if (!d.startsOn) return 'Informe quando a campanha começa.';
  if (d.endsOn && d.endsOn < d.startsOn) return 'O fim não pode ser antes do início.';
  return '';
}

export function linkExample(slug, kind = 'embaixador') {
  const base = kind === 'personal' ? '?personal=CODIGO' : '?ref=codigo';
  return `https://eafit.com.br/app/${base}&utm_campaign=${slug || '…'}`;
}

async function audit(adminId, action, details) {
  const { error } = await db.from('admin_audit_log').insert({ admin_id: adminId, target_user_id: null, action, details });
  if (error) console.warn('admin_audit_log:', error);
}

export async function fetchCampaigns() {
  const [{ data, error }, totals] = await Promise.all([
    db.from('partner_campaigns').select('*').order('created_at', { ascending: false }),
    db.rpc('admin_partner_campaign_totals'),
  ]);
  if (error) throw error;
  if (totals.error) throw totals.error;
  const byId = new Map((totals.data || []).map(t => [t.pt_campaign, t]));
  return (data || []).map(c => {
    const t = byId.get(c.id);
    return { ...c, visits: Number(t?.pt_visits) || 0, signups: Number(t?.pt_signups) || 0, activated: Number(t?.pt_activated) || 0 };
  });
}

export async function fetchCampaignResults(id) {
  const { data, error } = await db.rpc('admin_partner_campaign_results', { p_campaign: id });
  if (error) throw error;
  return (data || []).map(r => ({
    kind: r.pr_kind, name: r.pr_name, code: r.pr_code,
    visits: Number(r.pr_visits) || 0, signups: Number(r.pr_signups) || 0, activated: Number(r.pr_activated) || 0,
  }));
}

// Salva (cria ou edita). `publish`: true publica, false volta a rascunho,
// undefined mantém como está.
export async function saveCampaign(d, adminId, publish) {
  const row = {
    title: d.title.trim(), slug: d.slug, description: d.description.trim(), caption: d.caption.trim(), goal: d.goal.trim(),
    audiences: AUDIENCES.map(a => a.key).filter(k => d.audiences.includes(k)), starts_on: d.startsOn, ends_on: d.endsOn || null,
  };
  if (publish === true) row.published_at = new Date().toISOString();
  if (publish === false) row.published_at = null;
  const query = d.id
    ? db.from('partner_campaigns').update(row).eq('id', d.id).select().single()
    : db.from('partner_campaigns').insert({ ...row, created_by: adminId }).select().single();
  const { data, error } = await query;
  if (error) throw friendlyError(error);
  await audit(adminId, d.id ? 'partnerCampaignUpdate' : 'partnerCampaignCreate', { slug: data.slug, title: data.title, published: !!data.published_at });
  return data;
}

function friendlyError(error) {
  const msg = String(error?.message || '');
  if (error?.code === '23505' || msg.includes('duplicate key')) return new Error('Já existe uma campanha com esse endereço. Escolha outro.');
  if (msg.includes('slug_locked')) return new Error('O endereço não muda depois de publicada: os links já estão circulando.');
  return error;
}

// Apaga a campanha e os arquivos dela.
export async function deleteCampaign(c, adminId) {
  const { data: files } = await db.from('promo_materials').select('storage_path').eq('campaign_id', c.id);
  const { error } = await db.from('partner_campaigns').delete().eq('id', c.id);
  if (error) throw error;
  if (files?.length) await db.storage.from('promo-materials').remove(files.map(f => f.storage_path));
  await audit(adminId, 'partnerCampaignDelete', { slug: c.slug, title: c.title });
}

export async function fetchCampaignMaterials(id) {
  const { data, error } = await db.from('promo_materials')
    .select('id, title, description, storage_path, file_name, mime_type, size_bytes, created_at')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export function uploadCampaignMaterial({ campaignId, title, description, file, adminId }) {
  return uploadPromoMaterial({ title, description, file, adminId, campaignId });
}

// Texto do aviso (push + caixa do app) que o painel sugere ao publicar.
export function noticeFor(c) {
  const title = `📣 Nova campanha: ${c.title}`.slice(0, MESSAGE_TITLE_MAX);
  const intro = c.description?.trim() || 'Tem campanha nova da equipe EAFIT.';
  const body = `${intro}\n\nO seu link da campanha já está no app, com o texto e o material para postar.`.slice(0, MESSAGE_BODY_MAX);
  return { title, body };
}

// Avisa os parceiros do público da campanha. Embaixadores e influenciadores
// recebem como recado do programa (aba Recados); personais, como aviso.
// Devolve quantos receberam o aviso no app.
export async function notifyPartners(c, { title, body }) {
  let recipients = 0;
  const call = async payload => {
    const { data, error } = await db.functions.invoke('admin-broadcast', { body: { title: title.trim(), body: body.trim(), ...payload } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };
  for (const [kind, audience] of [['embaixador', 'embaixadores'], ['influenciador', 'influenciadores']]) {
    if (!c.audiences.includes(kind)) continue;
    try {
      recipients += (await call({ audience }))?.recipients ?? 0;
    } catch (err) {
      // Grupo sem ninguém ativo não impede avisar os outros.
      if (!/Nenhum (embaixador|influenciador) ativo/.test(err.message)) throw err;
    }
  }
  if (c.audiences.includes('personal')) {
    const { data: trainers, error } = await db.from('trainers').select('user_id');
    if (error) throw error;
    const ids = (trainers || []).map(t => t.user_id);
    if (ids.length) {
      await call({ targetUserIds: ids });
      recipients += ids.length;
    }
  }
  return recipients;
}
