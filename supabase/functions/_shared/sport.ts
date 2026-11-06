// Esporte da conta (user_metadata.esporte), como o app (app-react/src/lib/
// sportModule.js) e o banco (public.user_sport) enxergam. Só 'corrida' é outro
// esporte por enquanto; qualquer outro valor, ou nenhum, é musculação.
//
// Quem está no módulo de corrida não tem as telas de treino, água e nutrição:
// os lembretes e e-mails de musculação não são para essa pessoa (o banco faz o
// mesmo filtro nas regras de engajamento: engagement_rules.sport).
export type Sport = 'musculacao' | 'corrida';

export function sportOf(meta: unknown): Sport {
  const value = (meta as { esporte?: unknown } | null | undefined)?.esporte;
  return value === 'corrida' ? 'corrida' : 'musculacao';
}

export const isRunner = (meta: unknown): boolean => sportOf(meta) === 'corrida';

// Meta de km por semana do perfil (user_metadata.runWeeklyKm): número de 1 a 300
// (o campo é livre para o usuário, então qualquer outro valor vira "sem meta").
export function weeklyKmGoal(meta: unknown): number | null {
  const raw = (meta as { runWeeklyKm?: unknown } | null | undefined)?.runWeeklyKm;
  const km = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d{1,3}([.,]\d+)?$/.test(raw.trim()) ? Number(raw.trim().replace(',', '.')) : NaN;
  return Number.isFinite(km) && km >= 1 && km <= 300 ? km : null;
}
