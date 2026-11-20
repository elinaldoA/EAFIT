import { db } from './supabase';

// Uso real de cada módulo por pessoa (admin_module_usage_summary e
// admin_module_users, ver supabase/migrations/20270304030000_admin_module_usage.sql).
// "Declarado" é o esporte que a conta escolheu; "uso" é o que ela registrou de
// fato (treinos e/ou corridas).

export const PAGE_SIZE = 50;

export const USAGE_LABELS = {
  musculacao: 'Só musculação',
  corrida: 'Só Run',
  ambos: 'Usa os dois',
  nenhum: 'Ainda não usou',
};
export const USAGE_BADGE = { musculacao: 'badge--ok', corrida: 'badge--admin', ambos: 'badge--warning', nenhum: '' };

export const DECLARED_LABELS = { musculacao: 'Musculação', corrida: 'Run' };

// Filtros da tela: chave = parâmetro p_filter da função no banco.
export const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'musculacao', label: 'Só musculação' },
  { value: 'corrida', label: 'Só Run' },
  { value: 'ambos', label: 'Usam os dois' },
  { value: 'nenhum', label: 'Ainda não usaram' },
  { value: 'beta', label: 'Liberados no teste do Run' },
  { value: 'waitlist', label: 'Na lista de espera do Run' },
];

export async function fetchUsageSummary() {
  const { data, error } = await db.rpc('admin_module_usage_summary');
  if (error) throw error;
  const r = (data && data[0]) || {};
  return {
    total: Number(r.mu_total || 0),
    onlyStrength: Number(r.mu_only_strength || 0),
    onlyRun: Number(r.mu_only_run || 0),
    both: Number(r.mu_both || 0),
    none: Number(r.mu_none || 0),
    declaredRun: Number(r.mu_declared_run || 0),
    beta: Number(r.mu_beta || 0),
    waitlist: Number(r.mu_waitlist || 0),
  };
}

export async function fetchModuleUsers({ filter = '', search = '', page = 0, pageSize = PAGE_SIZE } = {}) {
  const { data, error } = await db.rpc('admin_module_users', {
    p_filter: filter || null,
    p_search: search || null,
    p_limit: pageSize,
    p_offset: page * pageSize,
  });
  if (error) throw error;
  const rows = data || [];
  return { rows, total: Number(rows[0]?.mu_total ?? 0) };
}

// Todas as linhas do filtro, em páginas de 500, para o CSV.
export async function fetchAllModuleUsers({ filter = '', search = '' } = {}) {
  const out = [];
  for (let page = 0; page < 40; page++) {
    const { rows } = await fetchModuleUsers({ filter, search, page, pageSize: 500 });
    out.push(...rows);
    if (rows.length < 500) break;
  }
  return out;
}

export const CSV_COLUMNS = [
  { key: 'mu_email', label: 'Email' },
  { key: 'mu_name', label: 'Nome' },
  { key: 'mu_declared', label: 'ModuloEscolhido' },
  { key: 'mu_usage', label: 'Uso' },
  { key: 'mu_train_30d', label: 'Treinos30d' },
  { key: 'mu_last_train', label: 'UltimoTreino' },
  { key: 'mu_runs_30d', label: 'Corridas30d' },
  { key: 'mu_last_run', label: 'UltimaCorrida' },
  { key: 'mu_beta', label: 'TesteDoRun' },
  { key: 'mu_waitlist', label: 'ListaDeEspera' },
  { key: 'mu_created_at', label: 'CriadoEm' },
];
