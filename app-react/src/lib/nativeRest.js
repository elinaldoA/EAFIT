import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';
import { t } from './i18n';
import { requestNativeNotificationPermission } from './nativeReminders';

// Aviso de fim do descanso entre séries no app Android. Com a tela apagada o JS da
// WebView é suspenso e o bip do RestTimer não toca; a notificação local é agendada
// no sistema e toca no horário certo mesmo assim.
const REST_ID = 9200;

export async function scheduleNativeRestEnd(seconds, label) {
  if (!isNative() || !(seconds > 0)) return;
  try {
    if ((await requestNativeNotificationPermission()) !== 'granted') return;
    await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] });
    await LocalNotifications.schedule({
      notifications: [{
        id: REST_ID,
        title: t('⏱️ Descanso acabou'),
        body: label ? t('Hora da próxima série · {label}', { label }) : t('Hora da próxima série'),
        isExactNotification: false,
        schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true },
      }],
    });
  } catch { /* sem o plugin: segue só o bip do app */ }
}

export async function cancelNativeRestEnd() {
  if (!isNative()) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: REST_ID }] }); } catch { /* sem o plugin */ }
}
