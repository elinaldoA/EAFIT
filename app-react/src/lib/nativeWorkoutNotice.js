import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';
import { t } from './i18n';
import { requestNativeNotificationPermission } from './nativeReminders';

// Notificação fixa do treino em andamento (app Android): fica na barra com o
// exercício e a série atuais (ou até que horas vai o descanso), e o toque volta
// ao app. Canal próprio e silencioso: atualizar o texto a cada série não pode apitar
// (o aviso de fim do descanso, em nativeRest.js, usa o canal padrão, com som).
const ID = 9300;
const CHANNEL = 'workout-live';
let channelReady = false;

async function ensureChannel() {
  if (channelReady) return;
  await LocalNotifications.createChannel({
    id: CHANNEL,
    name: t('Treino em andamento'),
    importance: 2,
    vibration: false,
  });
  channelReady = true;
}

export async function showWorkoutNotice(title, body) {
  if (!isNative()) return;
  try {
    if ((await requestNativeNotificationPermission()) !== 'granted') return;
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{
        id: ID, title, body, channelId: CHANNEL, ongoing: true, autoCancel: false,
        isExactNotification: false,
      }],
    });
  } catch { /* sem o plugin */ }
}

export async function clearWorkoutNotice() {
  if (!isNative()) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: ID }] }); } catch { /* sem o plugin */ }
}
