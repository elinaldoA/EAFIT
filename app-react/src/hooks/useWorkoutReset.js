import { useDeferredRemoval } from '../lib/useDeferredRemoval';
import { db } from '../lib/supabase';
import { getDateForWeekday } from '../lib/utils';
import { t, nDias } from '../lib/i18n';

// "Limpar a semana": esvazia a tela na hora e só apaga no servidor depois de 6 s
// (ou ao sair da tela), dando tempo de desfazer.
export function useWorkoutReset({ user, activePlanDays, bump, toast, syncNow }) {
  const resetRemoval = useDeferredRemoval();
  const isDayDone = dia => localStorage.getItem(`treino_${dia}`) === 'true';

  // Limpa a tela na hora, guardando uma cópia dos checks e cargas; a exclusão no
  // servidor (sessões da semana, que somem do Histórico, sem volta) só roda em 6s
  // ou ao sair da tela, a não ser que desfaça (devolve a cópia).
  function handleReset() {
    const doneDays = activePlanDays.filter(d => isDayDone(d.dia)).length;
    const isWeekKey = k => ['treino_', 'carga_', 'set_', 'warm_', 'hr_'].some(p => k.startsWith(p));
    const snapshot = Object.keys(localStorage).filter(isWeekKey).map(k => [k, localStorage.getItem(k)]);
    snapshot.forEach(([k]) => localStorage.removeItem(k));
    bump();
    const id = `reset_${Date.now()}`;
    if (user) {
      const dates = activePlanDays.map(d => getDateForWeekday(d.dia));
      resetRemoval.schedule(id, async () => {
        try {
          const { error } = await db.from('workouts').delete().eq('user_id', user.id).in('workout_date', dates);
          if (error) throw error;
          await syncNow();
        } catch (err) {
          console.error('resetWorkouts:', err);
          toast(t('⚠️ Limpou localmente, mas falhou ao sincronizar com o servidor — pode voltar ao reabrir o app'));
        }
      });
    }
    toast(
      doneDays > 0 ? t('🧹 Semana apagada, inclusive os treinos concluídos ({dias})', { dias: nDias(doneDays) }) : t('🧹 Checks e cargas limpos'),
      6000,
      {
        action: {
          label: t('Desfazer'),
          onClick: () => {
            resetRemoval.undo(id);
            snapshot.forEach(([k, v]) => localStorage.setItem(k, v));
            bump();
          },
        },
      },
    );
  }

  return handleReset;
}
