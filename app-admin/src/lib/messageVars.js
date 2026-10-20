import { db } from './supabase';

// Variáveis dos envios (Comunicação → Enviar notificação). Trocadas por
// pessoa nas Edge Functions admin-broadcast e send-scheduled-broadcast
// (supabase/functions/_shared/broadcastVars.ts); a prévia aqui usa a mesma regra.

export const MESSAGE_VARS = [
  { key: 'nome', label: 'Nome', hint: 'apelido ou primeiro nome' },
  { key: 'treinos_mes', label: 'Treinos no mês', hint: 'dias treinados neste mês' },
  { key: 'dias_sem_treinar', label: 'Dias sem treinar', hint: 'desde o último treino (vazio se nunca treinou)' },
];

export const SAMPLE_VARS = { nome: 'Ana', treinos_mes: 6, dias_sem_treinar: 3 };

// Push corta o texto no aparelho: acima disso, avisa.
export const PUSH_LIMITS = { title: 50, body: 150 };

// Mesma regra de personalize (supabase/functions/_shared/broadcastVars.ts):
// renderTemplate linha por linha, mantendo os parágrafos.
export function renderMessage(template, values = {}) {
  return String(template || '').split('\n').map(line => line
    .replace(/\{(\w+)\}/g, (_, key) => {
      const v = values[key];
      return v === null || v === undefined ? '' : String(v);
    })
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()).join('\n').trim();
}

// {algo} que não é variável conhecida: no envio, some do texto.
export function unknownVars(...texts) {
  const known = new Set(MESSAGE_VARS.map(v => v.key));
  const found = new Set();
  for (const t of texts) for (const m of String(t || '').matchAll(/\{(\w+)\}/g)) if (!known.has(m[1])) found.add(m[1]);
  return [...found];
}

export function usesVars(...texts) {
  return texts.some(t => MESSAGE_VARS.some(v => String(t || '').includes(`{${v.key}}`)));
}

// Insere o texto na posição do cursor; devolve o novo valor e onde fica o cursor.
export function insertAt(value, start, end, text) {
  const s = Number.isInteger(start) ? start : value.length;
  const e = Number.isInteger(end) ? end : s;
  return { value: value.slice(0, s) + text + value.slice(e), caret: s + text.length };
}

export async function fetchUserVars(userId) {
  const { data, error } = await db.rpc('admin_broadcast_vars', { p_user: userId });
  if (error) throw error;
  const r = data?.[0];
  return r ? { nome: r.bv_nome, treinos_mes: Number(r.bv_treinos_mes) || 0, dias_sem_treinar: r.bv_dias_sem_treinar } : {};
}
