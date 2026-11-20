import { db } from './supabase';

// Pré-cadastro do EAFIT Run (public.run_waitlist, ver
// supabase/migrations/20270304020000_run_waitlist.sql). Chega pelo site
// (/corrida), pelas redes (a origem vem do link) e pelo Perfil do app.

export const PAGE_SIZE = 50;

// Chaves precisam bater com o <select name="goal"> de
// app-react/public/landing/corrida/index.html e com o check da tabela.
export const GOAL_LABELS = {
  comecar: 'Começar a correr',
  '5k': '5 km',
  '10k': '10 km',
  '21k': 'Meia maratona',
  '42k': 'Maratona',
  saude: 'Saúde',
};

export const NOTIFIED_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'pendente', label: 'A avisar' },
  { value: 'avisado', label: 'Avisados' },
];

export async function fetchWaitlist({ notified = '', source = '', page = 0, pageSize = PAGE_SIZE } = {}) {
  let query = db.from('run_waitlist')
    .select('id, email, name, goal, level, source, lang, user_id, notified_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (notified === 'pendente') query = query.is('notified_at', null);
  if (notified === 'avisado') query = query.not('notified_at', 'is', null);
  if (source) query = query.eq('source', source);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
}

// Total e quebra por origem (qual divulgação trouxe gente). Lê só
// source/user_id/notified_at, até 10 mil linhas.
export async function fetchWaitlistSummary() {
  const { data, error } = await db.from('run_waitlist')
    .select('source, user_id, notified_at')
    .limit(10000);
  if (error) throw error;
  const rows = data || [];
  const bySource = {};
  for (const r of rows) bySource[r.source] = (bySource[r.source] || 0) + 1;
  return {
    total: rows.length,
    withAccount: rows.filter(r => r.user_id).length,
    pending: rows.filter(r => !r.notified_at).length,
    bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]),
  };
}

export async function setNotified(id, notified) {
  const { error } = await db.from('run_waitlist')
    .update({ notified_at: notified ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteWaitlistEntry(id) {
  const { error } = await db.from('run_waitlist').delete().eq('id', id);
  if (error) throw error;
}

// CSV (com BOM, para o Excel abrir os acentos) de tudo que está na lista.
export async function exportWaitlistCsv() {
  const { data, error } = await db.from('run_waitlist')
    .select('email, name, goal, source, lang, notified_at, created_at')
    .order('created_at', { ascending: true })
    .limit(10000);
  if (error) throw error;
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['email', 'nome', 'objetivo', 'origem', 'idioma', 'avisado_em', 'cadastrado_em'];
  const lines = (data || []).map(r => [r.email, r.name, r.goal, r.source, r.lang, r.notified_at, r.created_at].map(cell).join(','));
  return `﻿${[head.join(','), ...lines].join('\n')}`;
}
