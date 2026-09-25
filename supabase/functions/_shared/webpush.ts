// Helper de envio de web push, extraído pra uso pelo admin-broadcast (o
// terceiro lugar que precisaria dessa lógica). send-push/index.ts e
// send-reminders/index.ts já têm a mesma lógica inline, em produção — não
// foram tocados aqui pra não arriscar regressão em caminhos já implantados
// (um deles rodando via cron a cada minuto) por um refactor que não foi
// pedido.
import webpush from 'npm:web-push@3.6.7';

export function configureVapid() {
  const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
  webpush.setVapidDetails('mailto:contato@eafit.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

// Envia pra uma subscription; retorna 'sent', 'stale' (404/410 — o chamador
// deve apagar a linha) ou 'error' (outra falha, só loga).
export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: { title: string; body: string; tag?: string; url?: string }
): Promise<'sent' | 'stale' | 'error'> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ url: '/EAFIT/', ...payload })
    );
    return 'sent';
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) return 'stale';
    console.error('sendWebPush error:', err);
    return 'error';
  }
}
