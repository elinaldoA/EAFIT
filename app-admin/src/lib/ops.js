import { db } from './supabase';

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Administradores
// ---------------------------------------------------------------------------
export async function fetchAdmins() {
  return (await rpcRows('admin_list_admin_accounts')).map(r => ({
    id: r.ad_user, email: r.ad_email, name: r.ad_name, createdAt: r.ad_created, lastSignIn: r.ad_last_sign_in,
  }));
}

// Mesmo caminho de UserDetail: update direto em profiles (a trigger
// guard_profiles_is_admin só deixa um admin mudar is_admin) + auditoria.
export async function removeAdmin(userId, adminId) {
  const { error } = await db.from('profiles').update({ is_admin: false }).eq('id', userId);
  if (error) throw error;
  const { error: auditError } = await db.from('admin_audit_log').insert({
    admin_id: adminId, target_user_id: userId, action: 'demoteAdmin', details: null,
  });
  if (auditError) console.error('audit log:', auditError.message);
}

// ---------------------------------------------------------------------------
// Exclusões de conta
// ---------------------------------------------------------------------------
export const DELETION_SOURCE = { self: 'A própria pessoa', admin: 'Um administrador' };
export const DELETIONS_PAGE_SIZE = 50;

export async function fetchAccountDeletions({ page = 0 } = {}) {
  const from = page * DELETIONS_PAGE_SIZE;
  const { data, error, count } = await db.from('account_deletions')
    .select('id, deleted_at, source, account_age_days, workouts', { count: 'exact' })
    .order('deleted_at', { ascending: false })
    .range(from, from + DELETIONS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: data || [], total: count || 0 };
}

// Resumo das exclusões carregadas: quantas foram pedidas pela própria pessoa,
// quantas saíram sem nunca treinar e a idade mediana da conta.
export function summarizeDeletions(rows) {
  const list = rows || [];
  const ages = list.map(r => r.account_age_days).filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  return {
    total: list.length,
    self: list.filter(r => r.source === 'self').length,
    neverTrained: list.filter(r => r.workouts === 0).length,
    medianAgeDays: ages.length === 0 ? null : ages.length % 2 ? ages[mid] : Math.round((ages[mid - 1] + ages[mid]) / 2),
  };
}

export function formatAge(days) {
  if (days === null || days === undefined) return '—';
  if (days === 0) return 'no mesmo dia';
  if (days < 60) return `${days} dia(s)`;
  if (days < 730) return `${Math.round(days / 30)} meses`;
  return `${Math.round(days / 365)} anos`;
}

// ---------------------------------------------------------------------------
// Documentos legais
// ---------------------------------------------------------------------------
export const LEGAL_DOCS = [
  { key: 'termos', label: 'Termos de Uso', file: 'termos.html' },
  { key: 'privacidade', label: 'Política de Privacidade', file: 'privacidade.html' },
];

const LEGAL_ERRORS = {
  version_exists: 'Já existe uma versão com esse nome para esse documento.',
  invalid_version: 'Dê um nome para a versão (até 30 caracteres).',
  invalid_date: 'Informe a data de entrada em vigor.',
  invalid_summary: 'O resumo pode ter no máximo 500 caracteres.',
  invalid_doc: 'Documento inválido.',
  not_authorized: 'Sem permissão para essa ação.',
};

export function friendlyLegalError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(LEGAL_ERRORS).find(k => msg.includes(k));
  return key ? LEGAL_ERRORS[key] : msg || 'Não foi possível concluir.';
}

export function validateLegalVersion({ version, effectiveDate, summary }) {
  if (!String(version || '').trim() || String(version).trim().length > 30) return LEGAL_ERRORS.invalid_version;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate || ''))) return LEGAL_ERRORS.invalid_date;
  if (String(summary || '').length > 500) return LEGAL_ERRORS.invalid_summary;
  return '';
}

// Versão em vigor de cada documento: a de data mais recente (no empate, a
// registrada por último). Devolve { termos: versão|null, privacidade: versão|null }.
export function currentVersions(versions) {
  const out = Object.fromEntries(LEGAL_DOCS.map(d => [d.key, null]));
  for (const v of versions || []) {
    const cur = out[v.doc];
    if (cur === undefined) continue;
    if (!cur || v.effective_date > cur.effective_date
      || (v.effective_date === cur.effective_date && v.created_at > cur.created_at)) out[v.doc] = v;
  }
  return out;
}

// Link público do documento: os arquivos ficam no app (/app/legal), ao lado
// do painel (/admin).
export function legalUrl(file, base = import.meta.env.BASE_URL || '/') {
  return `${base.replace(/\/$/, '').replace(/\/admin$/, '')}/app/legal/${file}`;
}

export async function fetchLegalVersions() {
  const { data, error } = await db.from('legal_versions')
    .select('id, doc, version, effective_date, summary, created_at')
    .order('effective_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function publishLegalVersion({ doc, version, effectiveDate, summary }) {
  const { error } = await db.rpc('admin_publish_legal_version', {
    p_doc: doc, p_version: version.trim(), p_effective: effectiveDate, p_summary: (summary || '').trim(),
  });
  if (error) throw error;
}

// since = data de entrada em vigor da versão atual (ou null, se não há versão).
export async function fetchTermsAcceptance(since = null) {
  const r = (await rpcRows('admin_terms_acceptance', { p_since: since }))[0];
  if (!r) return null;
  return { users: Number(r.ta_users), accepted: Number(r.ta_accepted), before: Number(r.ta_before), never: Number(r.ta_never) };
}

// ---------------------------------------------------------------------------
// Limpeza de dados técnicos antigos
// ---------------------------------------------------------------------------
export const PURGE_DAYS = 180;
export const PURGE_KINDS = {
  page_visits: 'Visitas à landing e à tela de acesso',
  auth_events: 'Eventos da tela de acesso',
  user_events: 'Telas e funcionalidades abertas',
  notification_log: 'Controle de notificações automáticas',
  client_errors: 'Erros do app',
};

export async function fetchPurgeStats(days = PURGE_DAYS) {
  return (await rpcRows('admin_purge_stats', { p_days: days })).map(r => ({
    kind: r.pg_kind, label: PURGE_KINDS[r.pg_kind] || r.pg_kind, total: Number(r.pg_total), old: Number(r.pg_old),
  }));
}

// Devolve quantas linhas foram apagadas.
export async function purgeOld(kind, days = PURGE_DAYS) {
  const { data, error } = await db.rpc('admin_purge_old', { p_kind: kind, p_days: days });
  if (error) throw error;
  return Number(data || 0);
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
export function mapStorage(rows) {
  return (rows || []).map(r => ({
    bucket: r.su_bucket, isPublic: !!r.su_public, objects: Number(r.su_objects), bytes: Number(r.su_bytes),
  }));
}
