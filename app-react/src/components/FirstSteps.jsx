import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { useReminders } from '../hooks/useReminders';
import { isNotificationSupported } from '../lib/notifications';
import { isPushSupported } from '../lib/pushSubscriptions';
import { goTo } from '../lib/appNav';
import { trackFeature } from '../lib/tracking';
import {
  STEP_KEYS, countDone, dismissFirstSteps, fetchFirstSteps, isFirstStepsDismissed, isNewAccount,
} from '../lib/firstSteps';

import { t } from '../lib/i18n';
const STEPS = {
  workout: { icon: '🏋️', label: t('Fazer o primeiro treino'), hint: t('Toque em "Treino de hoje" aqui embaixo.') },
  water: { icon: '💧', label: t('Registrar um copo de água'), tab: 'hidratacao' },
  food: { icon: '🍎', label: t('Registrar uma refeição'), tab: 'nutricao' },
  reminders: { icon: '🔔', label: t('Ligar os lembretes'), tab: 'perfil' },
};

// Checklist dos primeiros dias, no topo do Treino (ver lib/firstSteps.js).
export default function FirstSteps({ onStartWorkout = null }) {
  const { user } = useAuth();
  const toast = useToast();
  const [, toggleReminders] = useReminders(toast, user);
  const userId = user?.id;
  const eligible = !!userId && isNewAccount(user) && !isFirstStepsDismissed(userId);
  const [steps, setSteps] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!eligible) return undefined;
    let active = true;
    fetchFirstSteps(userId).then(s => { if (active) setSteps(s); });
    return () => { active = false; };
  }, [eligible, userId]);

  if (!eligible || hidden || !steps) return null;
  const done = countDone(steps);
  if (done === STEP_KEYS.length) return null;

  // Liga os lembretes aqui mesmo, num toque, quando o navegador pergunta
  // (permissão ainda não decidida); senão leva ao Perfil, onde há o motivo.
  const canEnableHere = isNotificationSupported() && isPushSupported() && Notification.permission === 'default';
  async function handleReminders() {
    trackFeature('first_steps_reminders');
    if (!canEnableHere) { goTo({ tab: 'perfil' }); return; }
    await toggleReminders();
    setSteps(await fetchFirstSteps(userId));
  }

  function handleDismiss() {
    dismissFirstSteps(userId);
    trackFeature('first_steps_dismiss');
    setHidden(true);
  }

  return (
    <section className="first-steps" aria-label={t('Primeiros passos')}>
      <div className="first-steps__head">
        <strong>{t('Primeiros passos')}</strong>
        <span className="first-steps__count">{done}/{STEP_KEYS.length}</span>
        <button type="button" className="first-steps__close" onClick={handleDismiss} aria-label={t('Dispensar')}>✕</button>
      </div>
      <div className="first-steps__bar" aria-hidden="true"><span style={{ width: `${(done / STEP_KEYS.length) * 100}%` }} /></div>
      <ul className="first-steps__list">
        {STEP_KEYS.map(key => {
          const s = STEPS[key];
          const ok = steps[key];
          const inner = (
            <>
              <span className="first-steps__icon" aria-hidden="true">{ok ? '✅' : s.icon}</span>
              <span className="first-steps__label">{s.label}{!ok && s.hint && !(key === 'workout' && onStartWorkout) && <small>{s.hint}</small>}</span>
            </>
          );
          return (
            <li key={key} className={ok ? 'first-steps__item first-steps__item--done' : 'first-steps__item'}>
              {!ok && key === 'reminders' ? (
                <button type="button" onClick={handleReminders}>{inner}</button>
              ) : !ok && s.tab ? (
                <button type="button" onClick={() => { trackFeature(`first_steps_${key}`); goTo({ tab: s.tab }); }}>{inner}</button>
              ) : !ok && key === 'workout' && onStartWorkout ? (
                <button type="button" onClick={() => { trackFeature('first_steps_workout'); onStartWorkout(); }}>{inner}</button>
              ) : <div>{inner}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
