import { strengthCalories, weightFromMeta } from './calories';
import { calcDayVolume, gatherExerciseDetails, countSets } from './workoutSets';

// Treinos de segunda a sexta já concluídos na semana (o fim de semana não conta na meta).
export function weekProgress(activePlanDays) {
  const workDays = activePlanDays.filter(d => d.dia !== 'Sábado' && d.dia !== 'Domingo');
  const done = workDays.filter(d => localStorage.getItem(`treino_${d.dia}`) === 'true').length;
  return { done, total: workDays.length };
}

// Dados do resumo exibido ao finalizar (ou rever) o treino do dia.
export function buildWorkoutSummary({ day, durationMs, user, activePlanDays }) {
  const exercises = gatherExerciseDetails(day);
  const { done: totalSetsDone, total: totalPlannedSets } = countSets(exercises);
  const { done: weekDone, total: weekTotal } = weekProgress(activePlanDays);
  const kcal = strengthCalories({ durationSeconds: Math.round(durationMs / 1000), doneSets: totalSetsDone }, weightFromMeta(user?.user_metadata));
  return {
    day, durationMs, volume: calcDayVolume(day),
    exercises, totalSetsDone, totalPlannedSets, weekDone, weekTotal,
    ...(kcal ? { kcal } : {}),
  };
}
