// E-mails de ativação: quem criou a conta e ainda não finalizou nenhum treino
// recebe um lembrete 2 dias depois do cadastro e outro no 5º dia. O resumo
// semanal (weeklyEmails.ts) só alcança essa pessoa depois de 7 a 13 dias, e o
// push só chega a quem ativou as notificações, então a maioria passava a
// primeira semana sem nenhum contato.
//
// Roda uma vez por dia (send-activation-emails). A janela é o dia exato
// (cadastro + 2 e + 5), então cada passo sai uma única vez por conta, sem
// precisar de registro de envio.

export const ACTIVATION_DAYS = [2, 5] as const;
export type ActivationStep = 1 | 2;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// Passo de hoje para uma conta criada em `createdDate` (YYYY-MM-DD, Brasília),
// ou null. Quem já treinou não recebe: quem chama checa antes.
export function activationStepFor(createdDate: string, today: string): ActivationStep | null {
  const days = daysBetween(createdDate, today);
  const index = (ACTIVATION_DAYS as readonly number[]).indexOf(days);
  return index === -1 ? null : ((index + 1) as ActivationStep);
}
