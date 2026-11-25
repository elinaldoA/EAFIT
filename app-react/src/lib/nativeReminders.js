import { LocalNotifications } from '@capacitor/local-notifications';
import { t } from './i18n';

// Lembretes de água do app Android, agendados no próprio aparelho (funcionam
// com o app fechado). O PWA usa push do servidor (send-reminders), que não
// chega na WebView; os demais avisos do servidor dependem de FCM, ainda não feito.
// Mantenha em sincronia com WATER_REMINDER_TIMES em components/ReminderScheduler.jsx
// e em supabase/functions/send-reminders/index.ts.
export const WATER_TIMES = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'];
const BASE_ID = 9100;
const ids = () => WATER_TIMES.map((_, i) => ({ id: BASE_ID + i }));

// 'granted' | 'denied'. Pergunta só se ainda não foi respondida.
export async function requestNativeNotificationPermission() {
  try {
    let { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') ({ display } = await LocalNotifications.requestPermissions());
    return display === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function cancelNativeWaterReminders() {
  try { await LocalNotifications.cancel({ notifications: ids() }); } catch { /* sem o plugin */ }
}

// Repete todo dia nos horários da água. Cancela e agenda de novo, então é
// seguro chamar a cada abertura do app (também reflete a troca de idioma).
export async function scheduleNativeWaterReminders() {
  await cancelNativeWaterReminders();
  const notifications = WATER_TIMES.map((time, i) => {
    const [hour, minute] = time.split(':').map(Number);
    return {
      id: BASE_ID + i,
      title: t('💧 Hora de beber água'),
      body: t('Beba um copo de água e registre no app.'),
      schedule: { on: { hour, minute }, allowWhileIdle: true },
    };
  });
  await LocalNotifications.schedule({ notifications });
}

// Notificação imediata (botão "Testar notificação").
export async function sendNativeNotification(title, options = {}) {
  const permission = await requestNativeNotificationPermission();
  if (permission !== 'granted') throw new Error(t('Permissão de notificação: {permission}', { permission }));
  await LocalNotifications.schedule({
    notifications: [{ id: 9000 + Math.floor(Math.random() * 99), title, body: options.body || '' }],
  });
}
