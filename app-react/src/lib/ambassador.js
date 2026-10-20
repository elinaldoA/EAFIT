import { db } from './supabase';
import { ambassadorLink } from './links';
import { t } from './i18n';

// Painel do embaixador (Perfil → Embaixador): só números, nunca quem se
// cadastrou. Funções em supabase/migrations/20261109010000_ambassador_panel.sql.
// Influenciador é o mesmo programa com outro nome (kind, migration
// 20261118010000_ambassador_kind.sql).

// Canal vai no link (?origem=) porque WhatsApp e Instagram quase nunca dizem
// de onde a pessoa veio. Mesma lista do painel admin (app-admin/src/lib/ambassadors.js).
export const AMBASSADOR_CHANNELS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: '', label: t('Outros') },
];

const SOURCE_LABELS = {
  instagram: 'Instagram', whatsapp: 'WhatsApp', tiktok: 'TikTok', youtube: 'YouTube',
  facebook: 'Facebook', x: 'X', google: 'Google', landing: 'Site', 'outro-site': t('Outro site'),
  card: t('Card de treino'), qr: t('QR Code'),
};

export function sourceLabel(source) {
  if (!source || source === 'direto') return t('Link sem canal');
  return SOURCE_LABELS[source] || source;
}

export { ambassadorLink };

// % das visitas que viraram conta (sem visita, sem taxa).
export function conversion(visits, signups) {
  return visits > 0 ? Math.round((signups / visits) * 100) : null;
}

async function rows(name, days) {
  const { data, error } = await db.rpc(name, { days_back: days });
  if (error) throw error;
  return data || [];
}

export const isInfluencer = amb => amb?.kind === 'influenciador';

// null = a conta não é embaixadora.
export async function fetchMyAmbassador(days = 30) {
  const r = (await rows('my_ambassador_summary', days))[0];
  if (!r) return null;
  return {
    name: r.am_name, code: r.am_code, active: !!r.am_active, kind: r.am_kind || 'embaixador',
    visits: Number(r.am_visits) || 0, signups: Number(r.am_signups) || 0,
    total: Number(r.am_total) || 0, active7: Number(r.am_active_7d) || 0,
  };
}

export async function fetchMyAmbassadorChannels(days = 30) {
  return (await rows('my_ambassador_channels', days)).map(r => ({
    source: r.ch_source, visits: Number(r.ch_visits) || 0, signups: Number(r.ch_signups) || 0,
  }));
}

export async function fetchMyAmbassadorDaily(days = 30) {
  return (await rows('my_ambassador_daily', days)).map(r => ({
    day: r.day, visits: Number(r.visits) || 0, signups: Number(r.signups) || 0,
  }));
}

// 'shared' | 'copied' | 'cancelled' | 'failed' — mesmo contrato de shareInvite (lib/invite.js).
export async function shareAmbassadorLink(code, channel = '') {
  const url = ambassadorLink(code, channel);
  const text = t('Tô usando o EAFIT pra montar e registrar meus treinos. É grátis e funciona offline — bora treinar junto? 💪');
  if (navigator.share) {
    try {
      await navigator.share({ title: 'EAFIT', text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export async function copyAmbassadorLink(code, channel = '') {
  try {
    await navigator.clipboard.writeText(ambassadorLink(code, channel));
    return true;
  } catch {
    return false;
  }
}

// Textos prontos do modo Influenciador (aba Divulgar): o link já vai com o
// canal onde o texto costuma ser postado.
export const INFLUENCER_CAPTIONS = [
  {
    key: 'bio', label: () => t('Bio'), channel: 'instagram',
    text: link => t('Meu treino é montado e registrado no EAFIT. Grátis: {link}', { link }),
  },
  {
    key: 'stories', label: () => t('Stories e posts'), channel: 'instagram',
    text: link => t('Meu app de treino é o EAFIT: monta a semana, marca as séries e mostra a evolução. É grátis e funciona offline 👉 {link}', { link }),
  },
  {
    key: 'whatsapp', label: () => t('WhatsApp'), channel: 'whatsapp',
    text: link => t('Bora treinar junto? Tô usando o EAFIT pra montar e registrar meus treinos. É grátis: {link}', { link }),
  },
];

export function captionText(code, caption) {
  return caption.text(ambassadorLink(code, caption.channel));
}

export async function copyCaption(code, caption) {
  try {
    await navigator.clipboard.writeText(captionText(code, caption));
    return true;
  } catch {
    return false;
  }
}
