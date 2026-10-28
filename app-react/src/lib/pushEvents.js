// Avisa o servidor que uma notificação push de um envio do backoffice chegou
// ('received') ou foi tocada ('clicked'). Roda no service worker (sw.js), sem
// sessão: a pessoa é identificada pelo endpoint da inscrição push do aparelho.
// Melhor esforço — falha aqui nunca atrapalha a notificação. Ver
// supabase/functions/push-event/index.ts.

export const PUSH_EVENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-event`;

export async function reportPushEvent(registration, campaign, event, fetchFn = fetch) {
  if (!campaign) return;
  try {
    const sub = await registration.pushManager.getSubscription();
    if (!sub) return;
    await fetchFn(PUSH_EVENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, campaign, event }),
      keepalive: true,
    });
  } catch {
    // sem rede ou sem inscrição: o evento simplesmente não é contado
  }
}
