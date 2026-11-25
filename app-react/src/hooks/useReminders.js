import { useCallback, useState } from 'react';
import { requestNotificationPermission } from '../lib/notifications';
import { subscribeToPush, unsubscribeFromPush } from '../lib/pushSubscriptions';
import { isNative } from '../lib/native';
import { scheduleNativeWaterReminders, cancelNativeWaterReminders } from '../lib/nativeReminders';
import { registerNativePush, unregisterNativePush, getLastPushFailure } from '../lib/nativePush';

import { t } from '../lib/i18n';
export function useReminders(toast, user) {
  const [enabled, setEnabled] = useState(localStorage.getItem('reminders_enabled') === 'true');

  const toggle = useCallback(async () => {
    if (enabled) {
      localStorage.setItem('reminders_enabled', 'false');
      setEnabled(false);
      toast(t('🔕 Lembretes desativados'));
      if (isNative()) { cancelNativeWaterReminders(); unregisterNativePush(); }
      else unsubscribeFromPush().catch(err => console.error('unsubscribeFromPush:', err));
      return;
    }

    const perm = await requestNotificationPermission();
    if (perm !== 'granted') {
      toast(perm === 'unsupported' ? t('⚠️ Notificações não suportadas neste navegador') : t('⚠️ Permissão de notificação negada'));
      return;
    }

    localStorage.setItem('reminders_enabled', 'true');
    setEnabled(true);

    // App Android: push do servidor por FCM (os mesmos avisos do PWA). Se o FCM
    // não registrar (sem Google Play Services, sem rede), cai nos lembretes de
    // água agendados no próprio aparelho.
    if (isNative()) {
      if (await registerNativePush()) {
        await cancelNativeWaterReminders();
        toast(t('🔔 Lembretes ativados (funcionam mesmo com o app fechado)'));
        return;
      }
      try {
        await scheduleNativeWaterReminders();
        // Mostra o motivo do FCM não ter registrado (ver lib/nativePush.js).
        toast(`${t('🔔 Lembretes de água ativados (funcionam mesmo com o app fechado)')} [push: ${getLastPushFailure() || '?'}]`);
      } catch (err) {
        console.error('scheduleNativeWaterReminders:', err);
        toast(t('⚠️ Não foi possível agendar os lembretes'));
      }
      return;
    }

    if (user) {
      try {
        await subscribeToPush(user.id);
        toast(t('🔔 Lembretes ativados (funcionam mesmo com o app fechado)'));
      } catch (err) {
        console.error('subscribeToPush:', err);
        toast(t('🔔 Lembretes ativados (só com o app aberto — push indisponível)'));
      }
    } else {
      toast(t('🔔 Lembretes ativados'));
    }
  }, [enabled, toast, user]);

  return [enabled, toggle];
}
