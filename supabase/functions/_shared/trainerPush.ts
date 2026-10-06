// Regras puras da Edge Function trainer-push (testáveis sem rede).

export const MAX_BODY = 500;
export const MAX_RECIPIENTS = 200;

// Texto da notificação: uma linha, sem quebras, cortada com reticências.
export function previewText(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

// Destinatários realmente permitidos: os pedidos que são alunos ATIVOS do
// personal. Sem lista pedida, todos os alunos ativos. Ids duplicados contam uma vez.
export function pickRecipients(requested: unknown, activeClientIds: string[]): string[] {
  const active = new Set(activeClientIds);
  if (!Array.isArray(requested) || requested.length === 0) return [...active].slice(0, MAX_RECIPIENTS);
  const out = new Set<string>();
  for (const id of requested) {
    if (typeof id === 'string' && active.has(id)) out.add(id);
    if (out.size >= MAX_RECIPIENTS) break;
  }
  return [...out];
}
