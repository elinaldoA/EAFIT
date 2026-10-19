import { db } from './supabase';
import { LANDING_URL } from './links';
import { detectPersonal } from './pageVisits';
import { t } from './i18n';

// Link de convite do personal (https://eafit.com.br/app/?personal=CODIGO):
// o código fica guardado no navegador, vai no cadastro (user_metadata.personal,
// para a contagem do personal) e, já com a conta aberta, o app pede ao aluno
// que autorize o vínculo (TrainerInvitePrompt). Banco em
// supabase/migrations/20261119010000_trainer_invite_link.sql.

const KEY = 'eafit_personal_invite';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const APP_URL = `${LANDING_URL}app/`;

export function trainerInviteLink(code) {
  return `${APP_URL}?${new URLSearchParams({ personal: code })}`;
}

const normalize = value => detectPersonal(`?personal=${encodeURIComponent(String(value ?? ''))}`);

// Chamado ao abrir o app. Diferente do link de embaixador, o convite mais
// recente vale: é o personal que a pessoa acabou de escolher.
export function capturePersonalInvite(search = window.location.search, now = Date.now()) {
  const code = detectPersonal(search);
  if (!code) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, at: now }));
  } catch { /* sem armazenamento: o aluno ainda pode digitar o código */ }
}

// Código ainda válido, ou ''.
export function pendingPersonalInvite(now = Date.now()) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    const code = saved ? normalize(saved.code) : '';
    if (code && now - Number(saved.at) < TTL_MS) return code;
  } catch { /* sem armazenamento ou valor inválido */ }
  return '';
}

export function clearPersonalInvite() {
  try { localStorage.removeItem(KEY); } catch { /* sem armazenamento */ }
}

// Primeiro nome de quem convidou, ou null se o código não é de nenhum personal.
export async function fetchInviteName(code) {
  const { data, error } = await db.rpc('trainer_invite_name', { p_code: code });
  if (error) throw error;
  return data || null;
}

export async function acceptTrainerInvite(code) {
  const { data, error } = await db.rpc('link_trainer_invite', { p_code: code });
  if (error) throw error;
  return data;
}

// null = a conta não é personal.
export async function fetchInviteStats(days = 30) {
  const { data, error } = await db.rpc('trainer_invite_stats', { days_back: days });
  if (error) throw error;
  const r = (data || [])[0];
  if (!r) return null;
  return {
    code: r.iv_code, visits: Number(r.iv_visits) || 0,
    signups: Number(r.iv_signups) || 0, clients: Number(r.iv_clients) || 0,
  };
}

export function trainerInviteText(code) {
  return t('Quer treinar comigo pelo EAFIT? Crie sua conta grátis por este link e autorize o acompanhamento: {url} (se já tem conta, vá em Perfil → Meu personal e digite o código {code})', {
    url: trainerInviteLink(code), code,
  });
}

// 'shared' | 'copied' | 'cancelled' | 'failed' — mesmo contrato de shareAmbassadorLink.
export async function shareTrainerInvite(code) {
  const text = trainerInviteText(code);
  if (navigator.share) {
    try {
      await navigator.share({ title: 'EAFIT', text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export async function copyTrainerInviteLink(code) {
  try {
    await navigator.clipboard.writeText(trainerInviteLink(code));
    return true;
  } catch {
    return false;
  }
}
