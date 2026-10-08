import { db } from './supabase';
import { trackFeature } from './tracking';

import { t } from './i18n';
export const TITLE_MIN = 3;
export const TITLE_MAX = 50;
export const MAX_DAYS = 60;
export const DURATION_OPTIONS = [7, 14, 30];

const ERRORS = {
  invalid_code: t('Código não encontrado. Confira com quem te convidou.'),
  challenge_ended: t('Esse desafio já terminou.'),
  no_recipients: t('Nenhum aluno vinculado para participar.'),
  not_authorized: t('Sem permissão para essa ação.'),
  challenge_full: t('Esse desafio já está com 20 participantes.'),
  too_many_challenges: t('Você já tem 5 desafios em andamento. Aguarde algum terminar.'),
};

export function friendlyChallengeError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : t('Não foi possível concluir. Tente de novo.');
}

export function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Valida o formulário de criação. Período: começa hoje, dura `days` dias.
export function validateChallenge(title, days) {
  const name = String(title || '').trim();
  if (name.length < TITLE_MIN) return { ok: false, error: t('Dê um nome com pelo menos {TITLE_MIN} letras.', { TITLE_MIN }) };
  if (name.length > TITLE_MAX) return { ok: false, error: t('Nome com no máximo {TITLE_MAX} letras.', { TITLE_MAX }) };
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return { ok: false, error: t('Duração inválida.') };
  return { ok: true, title: name };
}

// 'futuro' | 'ativo' | 'encerrado' (datas YYYY-MM-DD, comparação lexical vale).
export function challengeStatus(c, today) {
  if (today < c.start_date) return 'futuro';
  if (today > c.end_date) return 'encerrado';
  return 'ativo';
}

export function daysLeft(c, today) {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = c.end_date.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// Recado que avisa a turma de um desafio criado pelo personal.
export function classChallengeMessage(title, endDate) {
  const [, m, d] = endDate.split('-');
  return t('Novo desafio da turma: "{title}", até {d}/{m}. Vence quem treinar mais dias! Acompanhe em Dashboard → Treinos → Desafios.', { title, d, m });
}

export function inviteText(c) {
  return t('Bora treinar juntos? Entra no desafio "{title}" no meu app de treino com o código {invite_code} (Dashboard → Treinos → Desafios).', { title: c.title, invite_code: c.invite_code });
}

function mapChallenge(r) {
  return {
    id: r.ch_id, title: r.ch_title, invite_code: r.ch_code,
    start_date: r.ch_start, end_date: r.ch_end,
    members: Number(r.ch_members), score: r.ch_score, rank: r.ch_rank,
  };
}

export async function fetchMyChallenges() {
  const { data, error } = await db.rpc('my_challenges');
  if (error) throw error;
  return (data || []).map(mapChallenge);
}

// Desafios oficiais do EAFIT abertos em que a pessoa ainda não entrou.
export async function fetchOfficialChallenges() {
  const { data, error } = await db.rpc('official_challenges');
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.oc_id, title: r.oc_title, invite_code: r.oc_code,
    start_date: r.oc_start, end_date: r.oc_end, members: Number(r.oc_members),
  }));
}

export async function createChallenge(title, start, end) {
  trackFeature('challenges');
  const { data, error } = await db.rpc('create_challenge', { p_title: title, p_start: start, p_end: end });
  if (error) throw error;
  return data;
}

// Personal: cria o desafio e coloca os alunos ativos (clientIds vazio = todos).
export async function createClassChallenge(title, start, end, clientIds) {
  const { data, error } = await db.rpc('trainer_create_challenge', {
    p_title: title, p_start: start, p_end: end, p_clients: clientIds && clientIds.length ? clientIds : null,
  });
  if (error) throw error;
  return data;
}

export async function deleteClassChallenge(id) {
  const { error } = await db.rpc('trainer_delete_challenge', { p_id: id });
  if (error) throw error;
}

export async function joinChallenge(code) {
  trackFeature('challenges');
  const { data, error } = await db.rpc('join_challenge', { p_code: code });
  if (error) throw error;
  return data;
}

export async function leaveChallenge(id) {
  const { error } = await db.rpc('leave_challenge', { p_id: id });
  if (error) throw error;
}

export async function fetchLeaderboard(id) {
  const { data, error } = await db.rpc('challenge_leaderboard', { p_id: id });
  if (error) throw error;
  return (data || []).map(r => ({ name: r.lb_name, score: r.lb_score, rank: r.lb_rank, isMe: r.lb_is_me }));
}
