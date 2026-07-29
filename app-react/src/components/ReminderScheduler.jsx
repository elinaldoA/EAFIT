import { useEffect, useRef } from 'react';
import { TODAY_DATE, WATER_STORAGE_KEY, getWaterGoalLiters } from '../data/treinoData';
import { useAuth } from '../context/AuthContext';
import { sendNotification } from '../lib/notifications';
import { isPushSupported } from '../lib/pushSubscriptions';

// Mantenha em sincronia com WATER_REMINDER_TIMES em
// supabase/functions/send-reminders/index.ts — duplicado de propósito porque
// este bundle (Vite) e a Edge Function (Deno) não compartilham módulos, mas
// os dois precisam disparar no mesmo horário.
const WATER_REMINDER_TIMES = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'];

// Fires periodic browser notifications for water reminders while the tab
// stays open. Skips checks entirely when the user has an active push
// subscription — the send-reminders Edge Function already covers those
// server-side (with different notification tags), so running both here
// would show duplicates. Kept as the fallback for users without push
// enabled, since nothing fires here once the app/tab is fully closed.
export default function ReminderScheduler() {
  const { user } = useAuth();
  const waterNotifiedRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    let pushActive = false;

    function checkReminders() {
      if (pushActive) return;
      if (localStorage.getItem('reminders_enabled') !== 'true') return;

      const now = new Date();
      const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      if (WATER_REMINDER_TIMES.includes(current) && !waterNotifiedRef.current.has(current)) {
        waterNotifiedRef.current.add(current);
        const goalMl = getWaterGoalLiters(user) * 1000;
        const currentMl = parseInt(localStorage.getItem(WATER_STORAGE_KEY), 10) || 0;
        if (currentMl < goalMl) {
          sendNotification('💧 Hora de beber água', {
            body: `Você bebeu ${(currentMl / 1000).toFixed(1)}L de ${(goalMl / 1000).toFixed(1)}L hoje.`,
            tag: `water-${TODAY_DATE}-${current}`,
          }).catch(err => console.error('sendNotification:', err));
        }
      }
    }

    async function init() {
      if (isPushSupported()) {
        try {
          const reg = await navigator.serviceWorker.ready;
          pushActive = !!(await reg.pushManager.getSubscription());
        } catch {
          // Falha ao checar a subscription: mantém o fallback client-side ligado.
        }
      }
      if (!cancelled) checkReminders();
    }

    init();
    const id = setInterval(checkReminders, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  return null;
}
