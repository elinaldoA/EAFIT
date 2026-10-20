// Metas do influenciador: marcos de cadastros pelo link (total desde o
// início). A mesma lista está em supabase/functions/_shared/ambassadorAlerts.ts,
// que comemora no aviso de novo cadastro o marco que acabou de ser batido.
export const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

// reached: marcos já batidos; next: o próximo (null depois do último);
// pct: quanto falta do marco anterior até o próximo, de 0 a 100.
export function goalProgress(total) {
  const n = Math.max(0, Number(total) || 0);
  const reached = MILESTONES.filter(m => n >= m);
  const next = MILESTONES.find(m => n < m) ?? null;
  const prev = reached.length ? reached[reached.length - 1] : 0;
  const pct = next === null ? 100 : Math.round(((n - prev) / (next - prev)) * 100);
  return { reached, next, prev, pct, missing: next === null ? 0 : next - n };
}
