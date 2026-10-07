import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { useReminders } from '../hooks/useReminders';
import { isNotificationSupported } from '../lib/notifications';
import { isPushSupported } from '../lib/pushSubscriptions';
import { shouldOfferPush, readDismissedAt, markPushPromptDismissed } from '../lib/pushPrompt';

import { t } from '../lib/i18n';
// Convite dentro do resumo do treino: "quer ser lembrado de treinar?". Só
// aparece se ainda faz sentido (ver shouldOfferPush). Ativar usa o mesmo fluxo
// do Perfil (permissão do navegador + inscrição push no servidor).
export default function PushPrompt() {
  const { user } = useAuth();
  const toast = useToast();
  const [remindersEnabled, toggleReminders] = useReminders(toast, user);
  const [hidden, setHidden] = useState(false);

  const offer = !hidden && shouldOfferPush({
    notificationsSupported: isNotificationSupported(),
    pushSupported: isPushSupported(),
    permission: isNotificationSupported() ? Notification.permission : 'unsupported',
    remindersEnabled,
    dismissedAt: readDismissedAt(),
  });
  if (!offer || !user) return null;

  async function handleEnable() {
    await toggleReminders();
    setHidden(true);
  }

  function handleDismiss() {
    markPushPromptDismissed();
    setHidden(true);
  }

  return (
    <div className="summary-section push-prompt">
      <div className="summary-section__title">{t('🔔 Quer ser lembrado de treinar?')}</div>
      <p className="push-prompt__text">
        {t('Ative os lembretes e receba um empurrãozinho no horário do treino, mesmo com o app fechado.')}
      </p>
      <div className="push-prompt__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={handleEnable}>{t('Ativar lembretes')}</button>
        <button type="button" className="btn btn--outline btn--sm" onClick={handleDismiss}>{t('Agora não')}</button>
      </div>
    </div>
  );
}
