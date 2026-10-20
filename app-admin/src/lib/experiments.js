import { db } from './supabase';
import { KNOWN_FLAGS } from './appSettings';

// Experimentos A/B e liberação gradual (Sistema → Experimentos). Tabela,
// sorteio e resultados em supabase/migrations/20261128080000_experiments.sql;
// o app aplica em app-react/src/lib/appConfig.js (applyExperiments) e expõe a
// variante com useExperiment(chave).

export const KIND_LABELS = { ab: 'Teste A/B', rollout: 'Liberação gradual' };
export const STATUS_LABELS = { rascunho: 'Rascunho', rodando: 'Rodando', encerrado: 'Encerrado' };
export const AUDIENCE_LABELS = {
  todos: 'Todos',
  ativos: 'Ativos (treinaram em 30 dias)',
  novos: 'Novos (conta com até 30 dias)',
  personal: 'Alunos de personal',
  academia: 'Treinam na academia',
  casa: 'Treinam em casa',
};
export const FLAG_OPTIONS = KNOWN_FLAGS;

const KEY_RE = /^[a-z0-9_]{2,40}$/;
const VARIANT_RE = /^[a-z0-9_]{1,20}$/;

// Liberação gradual: 'on' primeiro, para que aumentar o % só acrescente
// pessoas (quem já tinha a função continua tendo).
export function rolloutVariants(onPct) {
  const on = Math.max(0, Math.min(100, Math.round(Number(onPct) || 0)));
  return [{ key: 'on', weight: on }, { key: 'off', weight: 100 - on }];
}

export function buildExperimentRow(draft) {
  const key = String(draft.key || '').trim();
  const name = String(draft.name || '').trim();
  if (!KEY_RE.test(key)) return { error: 'Chave: de 2 a 40 letras minúsculas, números ou _.' };
  if (name.length < 2) return { error: 'Dê um nome ao experimento.' };
  if (!AUDIENCE_LABELS[draft.audience]) return { error: 'Escolha o público.' };
  let variants;
  if (draft.kind === 'rollout') {
    if (!FLAG_OPTIONS.some(f => f.key === draft.flag)) return { error: 'Escolha a funcionalidade.' };
    variants = rolloutVariants(draft.onPct);
  } else if (draft.kind === 'ab') {
    variants = (draft.variants || []).map(v => ({ key: String(v.key || '').trim(), weight: Number(v.weight) }));
    if (variants.length < 2 || variants.length > 4) return { error: 'De 2 a 4 variantes.' };
    if (variants.some(v => !VARIANT_RE.test(v.key))) return { error: 'Nome da variante: letras minúsculas, números ou _.' };
    if (new Set(variants.map(v => v.key)).size !== variants.length) return { error: 'As variantes precisam de nomes diferentes.' };
    if (variants.some(v => !Number.isInteger(v.weight) || v.weight < 0)) return { error: 'Pesos inteiros, de 0 a 100.' };
    if (variants.reduce((a, v) => a + v.weight, 0) !== 100) return { error: 'Os pesos precisam somar 100.' };
  } else {
    return { error: 'Escolha o tipo.' };
  }
  return {
    row: {
      key, name, description: String(draft.description || '').trim().slice(0, 500), kind: draft.kind,
      flag: draft.kind === 'rollout' ? draft.flag : null, variants, audience: draft.audience,
    },
  };
}

function mapExperiment(r) {
  return {
    key: r.key, name: r.name, description: r.description || '', kind: r.kind, flag: r.flag, variants: r.variants || [],
    audience: r.audience, status: r.status, startedAt: r.started_at, endedAt: r.ended_at, winner: r.winner,
    createdAt: r.created_at,
  };
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

// Teste de duas proporções (z): |z| >= 1,96 = diferença com 95% de confiança.
export function significance(aPart, aTotal, bPart, bTotal) {
  if (!aTotal || !bTotal) return null;
  const p1 = aPart / aTotal;
  const p2 = bPart / bTotal;
  const p = (aPart + bPart) / (aTotal + bTotal);
  const se = Math.sqrt(p * (1 - p) * (1 / aTotal + 1 / bTotal));
  if (!se) return { z: 0, significant: false };
  const z = (p2 - p1) / se;
  return { z: Math.round(z * 100) / 100, significant: Math.abs(z) >= 1.96 };
}

// Resultados por variante; a primeira variante cadastrada é a referência.
export function buildResults(experiment, rows) {
  const byKey = Object.fromEntries((rows || []).map(r => [r.xr_variant, r]));
  const days = Number(rows?.[0]?.xr_days) || 0;
  const variants = experiment.variants.map(v => {
    const r = byKey[v.key] || {};
    const users = Number(r.xr_users) || 0;
    const trained = Number(r.xr_trained) || 0;
    const newUsers = Number(r.xr_new_users) || 0;
    return {
      key: v.key, weight: v.weight, users, trained,
      openedPct: pct(Number(r.xr_opened) || 0, users),
      trainedPct: pct(trained, users),
      daysPerWeek: users && days ? Math.round(((Number(r.xr_train_days) || 0) / users / days) * 7 * 10) / 10 : null,
      newUsers,
      newActivated: Number(r.xr_new_activated) || 0,
      activationPct: pct(Number(r.xr_new_activated) || 0, newUsers),
      featurePct: experiment.flag ? pct(Number(r.xr_feature_users) || 0, users) : null,
    };
  });
  const base = variants[0];
  return {
    days,
    total: variants.reduce((a, v) => a + v.users, 0),
    variants: variants.map((v, i) => ({
      ...v,
      vsBase: i === 0 || !base ? null : significance(base.trained, base.users, v.trained, v.users),
      liftPct: i === 0 || base?.trainedPct == null || v.trainedPct == null ? null : Math.round((v.trainedPct - base.trainedPct) * 10) / 10,
    })),
  };
}

export async function fetchExperiments() {
  const { data, error } = await db.from('experiments').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapExperiment);
}

export async function fetchExperimentResults(key) {
  const { data, error } = await db.rpc('admin_experiment_results', { p_key: key });
  if (error) throw error;
  return data || [];
}

export async function createExperiment(row, adminId) {
  const { error } = await db.from('experiments').insert({ ...row, created_by: adminId });
  if (error) throw error;
}

export async function updateExperiment(key, patch) {
  const { error } = await db.from('experiments').update(patch).eq('key', key);
  if (error) throw error;
}

export async function deleteExperiment(key) {
  const { error } = await db.from('experiments').delete().eq('key', key);
  if (error) throw error;
}
