import { useCallback, useState } from 'react';
import { requestNotificationPermission } from '../lib/notifications';
import { subscribeToPush, unsubscribeFromPush } from '../lib/pushSubscriptions';

import { t } from '../lib/i18n';
export function useReminders(toast, user) {
  const [enabled, setEnabled] = useState(localStorage.getItem('reminders_enabled') === 'true');

  const toggle = useCallback(async () => {
    if (enabled) {
      localStorage.setItem('reminders_enabled', 'false');
      setEnabled(false);
      toast(t('🔕 Lembretes desativados'));
      unsubscribeFromPush().catch(err => console.error('unsubscribeFromPush:', err));
      return;
    }

    const perm = await requestNotificationPermission();
    if (perm !== 'granted') {
      toast(perm === 'unsupported' ? t('⚠️ Notificações não suportadas neste navegador') : t('⚠️ Permissão de notificação negada'));
      return;
    }

    localStorage.setItem('reminders_enabled', 'true');
    setEnabled(true);

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
