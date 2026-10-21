import { db } from './supabase';

// Pesquisas dentro do app (Acompanhamento → Pesquisas). Tabelas e funções em
// supabase/migrations/20261128070000_surveys.sql; o app mostra em
// app-react/src/components/SurveyPrompt.jsx.

export const KIND_LABELS = { nps: 'NPS (0 a 10)', escolha: 'Múltipla escolha', texto: 'Texto livre' };
export const AUDIENCE_LABELS = {
  todos: 'Todos',
  ativos: 'Ativos (treinaram em 30 dias)',
  novos: 'Novos (conta com até 30 dias)',
  personal: 'Alunos de personal',
  academia: 'Treinam na academia',
  condominio: 'Treinam no condomínio',
  casa: 'Treinam em casa',
};
export const MAX_OPTIONS = 6;
export const NPS_QUESTION = 'De 0 a 10, quanto você recomendaria o EAFIT a um amigo?';

export const BREAKDOWNS = [
  { key: 'meta', label: 'Objetivo' },
  { key: 'nivel', label: 'Nível' },
  { key: 'local', label: 'Local' },
  { key: 'personal', label: 'Personal' },
  { key: 'active30', label: 'Treinou em 30 dias' },
  { key: 'tenure', label: 'Tempo de conta' },
];

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

export function surveyStatus(s, today) {
  if (!s.active) return 'pausada';
  if (s.startsOn && today < s.startsOn) return 'agendada';
  if (s.endsOn && today > s.endsOn) return 'encerrada';
  return 'no_ar';
}
export const STATUS_LABELS = { no_ar: 'No ar', agendada: 'Agendada', encerrada: 'Encerrada', pausada: 'Pausada' };

// Valida e limpa o formulário; devolve { error } ou { row } no formato da tabela.
export function buildSurveyRow(draft) {
  const question = String(draft.question || '').trim();
  const questionEn = String(draft.questionEn || '').trim();
  const options = draft.kind === 'escolha'
    ? [...new Set((draft.options || []).map(o => String(o || '').trim()).filter(Boolean))]
    : [];
  const minDays = Number(draft.minAccountDays);
  if (!KIND_LABELS[draft.kind]) return { error: 'Escolha o tipo.' };
  if (question.length < 3) return { error: 'Escreva a pergunta.' };
  if (question.length > 200 || questionEn.length > 200) return { error: 'A pergunta pode ter até 200 caracteres.' };
  if (draft.kind === 'escolha' && options.length < 2) return { error: 'Coloque ao menos 2 opções.' };
  if (options.length > MAX_OPTIONS) return { error: `No máximo ${MAX_OPTIONS} opções.` };
  if (options.some(o => o.length > 80)) return { error: 'Cada opção pode ter até 80 caracteres.' };
  if (!AUDIENCE_LABELS[draft.audience]) return { error: 'Escolha o público.' };
  if (!Number.isInteger(minDays) || minDays < 0 || minDays > 365) return { error: 'Dias de conta: de 0 a 365.' };
  if (draft.startsOn && draft.endsOn && draft.startsOn > draft.endsOn) return { error: 'O fim vem antes do início.' };
  return {
    row: {
      kind: draft.kind, question, question_en: questionEn || null, options, audience: draft.audience,
      min_account_days: minDays, starts_on: draft.startsOn || null, ends_on: draft.endsOn || null,
      active: draft.active !== false,
    },
  };
}

function mapSurvey(r) {
  return {
    id: r.sv_id, kind: r.sv_kind, question: r.sv_question, questionEn: r.sv_question_en || '', options: r.sv_options || [],
    audience: r.sv_audience, minAccountDays: r.sv_min_account_days, startsOn: r.sv_starts_on || '', endsOn: r.sv_ends_on || '',
    active: !!r.sv_active, createdAt: r.sv_created_at, answers: Number(r.sv_answers) || 0, lastAnswer: r.sv_last_answer,
  };
}

function mapAnswer(r) {
  return {
    id: r.sa_id, userId: r.sa_user, name: r.sa_name, email: r.sa_email, score: r.sa_score, choice: r.sa_choice,
    comment: r.sa_comment, at: r.sa_at, meta: r.sa_meta, nivel: r.sa_nivel, local: r.sa_local,
    personal: !!r.sa_personal, accountDays: r.sa_account_days, active30: !!r.sa_active30,
  };
}

// NPS = % promotores (9–10) − % detratores (0–6), de −100 a 100.
export function npsOf(answers) {
  const scored = answers.filter(a => a.score !== null && a.score !== undefined);
  const promoters = scored.filter(a => a.score >= 9).length;
  const detractors = scored.filter(a => a.score <= 6).length;
  const total = scored.length;
  return {
    total, promoters, detractors, passives: total - promoters - detractors,
    nps: total ? pct(promoters, total) - pct(detractors, total) : null,
  };
}

function groupValue(a, key) {
  if (key === 'personal') return a.personal ? 'Com personal' : 'Sem personal';
  if (key === 'active30') return a.active30 ? 'Sim' : 'Não';
  if (key === 'local') return { casa: 'Em casa', condominio: 'Condomínio' }[a.local] || 'Academia';
  if (key === 'tenure') {
    if (a.accountDays < 30) return 'Até 30 dias';
    if (a.accountDays < 90) return '1 a 3 meses';
    return 'Mais de 3 meses';
  }
  return a[key] || 'não informado';
}

// Resultado da pesquisa: total, NPS (ou contagem das opções), recorte pela
// dimensão escolhida e evolução por semana (segunda-feira de cada semana).
export function buildResults(survey, answers, breakdown = 'meta') {
  const list = answers || [];
  const out = { total: list.length, comments: list.filter(a => a.comment) };
  if (survey.kind === 'nps') {
    out.nps = npsOf(list);
    out.distribution = Array.from({ length: 11 }, (_, n) => {
      const total = list.filter(a => a.score === n).length;
      return { key: String(n), label: String(n), total, pct: pct(total, list.length) };
    });
  } else if (survey.kind === 'escolha') {
    out.distribution = survey.options.map(o => {
      const total = list.filter(a => a.choice === o).length;
      return { key: o, label: o, total, pct: pct(total, list.length) };
    });
  }
  const groups = {};
  for (const a of list) (groups[groupValue(a, breakdown)] ||= []).push(a);
  out.breakdown = Object.entries(groups).map(([label, rows]) => ({
    label,
    total: rows.length,
    nps: survey.kind === 'nps' ? npsOf(rows).nps : null,
    top: survey.kind === 'escolha'
      ? survey.options.map(o => ({ o, n: rows.filter(r => r.choice === o).length })).sort((x, y) => y.n - x.n)[0]?.o || null
      : null,
  })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  const weeks = {};
  for (const a of list) {
    const d = new Date(a.at);
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    (weeks[monday.toISOString().slice(0, 10)] ||= []).push(a);
  }
  out.weekly = Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([week, rows]) => ({
    week, total: rows.length, nps: survey.kind === 'nps' ? npsOf(rows).nps : null,
  }));
  return out;
}

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export async function fetchSurveys() {
  return (await rpcRows('admin_surveys')).map(mapSurvey);
}

export async function fetchSurveyAnswers(id) {
  return (await rpcRows('admin_survey_answers', { p_survey: id })).map(mapAnswer);
}

export async function saveSurvey(id, row, adminId) {
  const q = id
    ? db.from('surveys').update(row).eq('id', id)
    : db.from('surveys').insert({ ...row, created_by: adminId });
  const { error } = await q;
  if (error) throw error;
}

export async function setSurveyActive(id, active) {
  const { error } = await db.from('surveys').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteSurvey(id) {
  const { error } = await db.from('surveys').delete().eq('id', id);
  if (error) throw error;
}
