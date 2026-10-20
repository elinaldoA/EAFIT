// Variáveis dos envios manuais e agendados ({nome}, {treinos_mes},
// {dias_sem_treinar}): os valores vêm de ops_broadcast_vars
// (supabase/migrations/20261128200000_broadcast_vars.sql) e a troca usa a mesma
// renderTemplate das automáticas (variável sem valor some, sem deixar espaço
// ou vírgula sobrando). Texto sem variável segue o caminho de sempre.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { renderTemplate } from './engagement.ts';

export const BROADCAST_VARS = ['nome', 'treinos_mes', 'dias_sem_treinar'] as const;
export type BroadcastVars = { nome: string | null; treinos_mes: number; dias_sem_treinar: number | null };

const VAR_RE = new RegExp(`\\{(${BROADCAST_VARS.join('|')})\\}`);

export function usesVars(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && VAR_RE.test(t));
}

// Linha por linha, para não juntar os parágrafos (o e-mail separa por \n).
export function personalize(text: string, vars: BroadcastVars | undefined): string {
  return text.split('\n').map((line) => renderTemplate(line, vars ?? {})).join('\n').trim();
}

type VarRow = { bv_user: string; bv_nome: string | null; bv_treinos_mes: number | string; bv_dias_sem_treinar: number | null };

export function mapVarRows(rows: VarRow[]): Map<string, BroadcastVars> {
  return new Map(rows.map((r) => [r.bv_user, {
    nome: r.bv_nome, treinos_mes: Number(r.bv_treinos_mes) || 0, dias_sem_treinar: r.bv_dias_sem_treinar,
  }]));
}

// ids nulo = todos os usuários. Falha = mapa vazio (as variáveis somem do texto).
export async function loadBroadcastVars(admin: SupabaseClient, ids: string[] | null): Promise<Map<string, BroadcastVars>> {
  const { data, error } = await admin.rpc('ops_broadcast_vars', { p_users: ids && ids.length ? ids : null });
  if (error) {
    console.error('ops_broadcast_vars error:', error.message);
    return new Map();
  }
  return mapVarRows((data || []) as VarRow[]);
}
