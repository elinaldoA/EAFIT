import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { isCoachAvailable, getCoachPrefs, saveCoachPrefs } from '../lib/coach';
import { shouldOfferCoach, readCoachPromptDismissedAt, markCoachPromptDismissed } from '../lib/coachPrompt';

import { t } from '../lib/i18n';
// Convite no modo treino: "quer um treinador falando com você?". Só aparece se
// ainda faz sentido (ver shouldOfferCoach). Ativar grava no aparelho e na
// conta, como o Perfil, e chama onEnabled pra voz já começar a falar.
export default function CoachPrompt({ onEnabled }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [hidden, setHidden] = useState(false);

  const offer = !hidden && !!user && shouldOfferCoach({
    available: isCoachAvailable(),
    enabled: getCoachPrefs().enabled,
    decided: user.user_metadata?.coachEnabled !== undefined,
    dismissedAt: readCoachPromptDismissedAt(),
  });
  if (!offer) return null;

  function handleEnable() {
    saveCoachPrefs({ enabled: true });
    setHidden(true);
    onEnabled();
    toast(t('🎙️ Treinador por voz ativado — ajuste a voz e o tom em Perfil'));
    updateProfile({ coachEnabled: true }).then(({ error }) => error && toast(`❌ ${error.message}`));
  }

  function handleDismiss() {
    markCoachPromptDismissed();
    setHidden(true);
  }

  return (
    <div className="live__coach-prompt">
      <strong>{t('🎙️ Quer um treinador falando com você?')}</strong>
      <p>{t('Ele apresenta cada exercício, conta o descanso e comemora seus recordes. Use fone ou aumente o volume.')}</p>
      <div className="live__coach-prompt-actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={handleEnable}>{t('Ativar voz')}</button>
        <button type="button" className="btn btn--outline btn--sm" onClick={handleDismiss}>{t('Agora não')}</button>
      </div>
    </div>
  );
}
