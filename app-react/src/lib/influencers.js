import { db } from './supabase';
import { LANDING_URL } from './links';
import { todayDate } from '../data/treinoData';
import { t } from './i18n';

// Influenciadores (fase 1): vitrine de programas, seguir, começar um programa
// e a área do próprio influenciador. Funções em
// supabase/migrations/20261116010000_influencers.sql. O influenciador é um
// embaixador promovido; o código dele é o @ e o link da página pública
// (eafit.com.br/i/?u=<code>, em public/landing/i/).

export const LEVELS = [
  { key: 'iniciante', label: t('Iniciante') },
  { key: 'intermediario', label: t('Intermediário') },
  { key: 'avancado', label: t('Avançado') },
];

// "1 dia" / "3 dias": singular quando n === 1 (os dois textos passam por t()).
export function plural(n, one, many) {
  return Number(n) === 1 ? t(one) : t(many, { n });
}

export function levelLabel(key) {
  return LEVELS.find(l => l.key === key)?.label || '';
}

// Cor de destaque do influenciador; sem ela (ou inválida), a do app.
export function accentOf(influencer) {
  return /^#[0-9a-fA-F]{6}$/.test(influencer?.accent || '') ? influencer.accent : null;
}

// ref= faz a visita e o cadastro contarem para o influenciador (site.js guarda
// o código como o link de embaixador).
export function influencerPageUrl(code, programId = null) {
  const params = new URLSearchParams({ u: code, ref: code });
  if (programId) params.set('p', programId);
  return `${LANDING_URL}i/?${params}`;
}

// Link que abre o app já com o convite do programa (e o crédito do cadastro).
export function programAppUrl(code, programId) {
  return `${LANDING_URL}app/?${new URLSearchParams({ ref: code, programa: programId })}`;
}

async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}

// ---- Seguidor ----

export async function fetchDirectory() {
  return (await rpc('influencers_directory')) || [];
}

// null = não é influenciador ativo.
export async function fetchInfluencer(code) {
  return rpc('influencer_profile', { p_code: code });
}

// Programa publicado com os dias (`plan`) e o influenciador; null se saiu do ar.
export async function fetchProgram(id) {
  return rpc('influencer_program', { p_id: id });
}

export async function setFollowing(code, follow) {
  return rpc('influencer_follow', { p_code: code, p_follow: follow });
}

// Vira o plano ativo (o anterior fica salvo em "Editar treino").
export async function adoptProgram(id) {
  return rpc('adopt_influencer_program', { p_program: id, p_start_date: todayDate() });
}

// [{ code, name, followedAt }] de quem a conta segue (vai no backup).
export async function fetchMyFollowing() {
  return (await rpc('my_followed_influencers')) || [];
}

// { id, name, influencer } do plano ativo, ou null quando o plano não veio de programa.
export async function fetchMyActiveProgram() {
  return rpc('my_active_program');
}

// ---- Influenciador ----

// null = a conta não é influenciadora.
export async function fetchMyInfluencer() {
  return rpc('my_influencer');
}

export async function saveInfluencerProfile({ bio, instagram, accent }) {
  return rpc('influencer_save_profile', { p_bio: bio, p_instagram: instagram, p_accent: accent });
}

export async function saveProgram(id, program) {
  return rpc('influencer_save_program', { p_id: id || null, p_program: program });
}

export async function submitProgram(id) {
  return rpc('influencer_submit_program', { p_id: id });
}

export async function setProgramHidden(id, hidden) {
  return rpc('influencer_set_program_hidden', { p_id: id, p_hidden: hidden });
}

export async function deleteProgram(id) {
  return rpc('influencer_delete_program', { p_id: id });
}

// Situação do programa para o influenciador, do rascunho ao ar.
export function programStatus(p) {
  if (p.status === 'review') return { key: 'review', label: t('Em revisão') };
  if (p.status === 'rejected') return { key: 'rejected', label: t('Recusado') };
  if (p.status === 'editing') return { key: 'editing', label: p.live ? t('Edição não enviada') : t('Rascunho') };
  if (p.hidden) return { key: 'hidden', label: t('Escondido') };
  return { key: 'live', label: t('No ar') };
}

const ERRORS = {
  not_influencer: t('Sua conta não é de influenciador.'),
  invalid_name: t('Dê um nome ao programa (2 a 60 letras).'),
  invalid_description: t('A descrição pode ter até 500 caracteres.'),
  invalid_level: t('Escolha o nível do programa.'),
  invalid_duration: t('Duração inválida.'),
  invalid_days: t('Marque de 1 a 7 dias de treino.'),
  invalid_exercises: t('Cada dia precisa de 1 a 20 exercícios com nome.'),
  too_many_programs: t('Limite de 20 programas atingido.'),
  program_not_found: t('Programa não encontrado. Atualize a tela.'),
  influencer_not_found: t('Influenciador não encontrado.'),
};

export function friendlyInfluencerError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : t('Algo deu errado. Tente de novo.');
}

// ---- Convite para um programa (?programa=<id> no link do app) ----
// Guardado no aparelho por 7 dias: quem chega sem conta faz o cadastro e o
// onboarding, e o convite aparece no Treino logo depois (ProgramInvite).

const INVITE_KEY = 'eafit_program_invite';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function captureProgramInvite(search = window.location.search, now = Date.now()) {
  const id = String(new URLSearchParams(search || '').get('programa') ?? '').trim();
  if (!UUID_RE.test(id)) return;
  try { localStorage.setItem(INVITE_KEY, JSON.stringify({ id, at: now })); } catch { /* sem armazenamento */ }
}

export function pendingProgramInvite(now = Date.now()) {
  try {
    const saved = JSON.parse(localStorage.getItem(INVITE_KEY) || 'null');
    if (saved && UUID_RE.test(saved.id) && now - Number(saved.at) < INVITE_TTL_MS) return saved.id;
  } catch { /* valor inválido */ }
  return null;
}

export function clearProgramInvite() {
  try { localStorage.removeItem(INVITE_KEY); } catch { /* sem armazenamento */ }
}

// 'shared' | 'copied' | 'cancelled' | 'failed' — mesmo contrato de shareInvite (lib/invite.js).
export async function shareLink(url, text) {
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
