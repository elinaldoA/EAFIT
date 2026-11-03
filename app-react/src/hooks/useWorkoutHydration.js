import { useEffect, useRef, useState } from 'react';
import { playHydrationSound } from '../lib/sound';
import { coachSay } from '../lib/coach';
import { sendNotification } from '../lib/notifications';
import { nextHydrationAt, shouldRemindHydration, HYDRATION_EVERY_MS, HYDRATION_SHOW_MS } from '../lib/workoutHydration';
import { t } from '../lib/i18n';

// Lembrete de hidratação automático: acompanha o cronômetro do treino (o mesmo
// da lista e do modo ao vivo), sem nada para ligar — começou o treino, ele
// avisa a cada 15 min de treino ativo, de preferência num descanso.
// Com o app em segundo plano o aviso na tela não é visto, então vai como
// notificação do aparelho (se a permissão já foi dada).
// timer: useWorkoutTimer; resting: há um descanso correndo agora.
export function useWorkoutHydration({ timer, resting, enabled = true }) {
  const [alert, setAlert] = useState(null); // { id }
  const nextAt = useRef(nextHydrationAt(timer.elapsedMs));
  const running = timer.status === 'running';

  // Quem começa o treino agora (ou retoma um antigo) conta o marco a partir dali.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (running && !wasRunning.current && timer.elapsedMs < HYDRATION_EVERY_MS) nextAt.current = nextHydrationAt(timer.elapsedMs);
    wasRunning.current = running;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    if (!enabled || !running) return;
    if (!shouldRemindHydration({ elapsedMs: timer.elapsedMs, nextAt: nextAt.current, resting })) return;
    nextAt.current = timer.elapsedMs + HYDRATION_EVERY_MS;
    setAlert({ id: Date.now() });
    playHydrationSound();
    coachSay('hydrate', {}, { queue: true });
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      sendNotification(t('💧 Hora de se hidratar'), {
        body: t('Alguns goles de água ajudam a manter o rendimento.'),
        tag: 'workout-water',
      }).catch(() => {});
    }
  }, [enabled, running, timer.elapsedMs, resting]);

  // Terminou ou pausou o treino: o aviso perde o sentido.
  useEffect(() => {
    if (!running) setAlert(null);
  }, [running]);

  useEffect(() => {
    if (!alert) return;
    const id = setTimeout(() => setAlert(null), HYDRATION_SHOW_MS);
    return () => clearTimeout(id);
  }, [alert]);

  return { alert, dismiss: () => setAlert(null) };
}
