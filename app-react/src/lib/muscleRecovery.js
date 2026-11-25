import { MUSCLES, muscleOfName } from './muscleVolume';

// Recuperação muscular: dá a cada grupo um estado (descansando, quase pronto,
// recuperado) a partir do último dia em que ele foi treinado e de quantas séries
// recebeu. É uma estimativa simples e explicável, não uma medição: o app só sabe a
// DATA do treino (não a hora), então tudo é contado em dias.
//
// Regra: cada músculo tem uma janela de recuperação em dias.
//   • Grandes (peito, costas, coxas, glúteos): 2 dias.
//   • Pequenos ou que se recuperam rápido (ombros, braços, abdômen, panturrilha): 1 dia.
//   • Volume alto soma 1 dia: 10 séries ou mais nos últimos 2 dias de treino do músculo
//     (treinar em dias seguidos soma o cansaço).
// Estado: passou a janela inteira → recuperado; passou metade → quase pronto; antes → descansando.

export const RECOVERY_BASE_DAYS = {
  chest: 2, back: 2, quads: 2, hamstrings: 2, glutes: 2,
  shoulders: 1, biceps: 1, triceps: 1, abs: 1, calves: 1,
};
// Séries (no último dia treinado e no dia anterior) a partir das quais a janela ganha 1 dia.
export const HEAVY_SETS = 10;

const dayNumber = dateStr => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

export const recoveryWindowDays = (muscle, sets) => (RECOVERY_BASE_DAYS[muscle] ?? 2) + (sets >= HEAVY_SETS ? 1 : 0);

// sets: [{ exercise_name, workout_date }] (uma linha por série concluída, ver
// fetchRecentSets em trainingCoach.js). today: 'YYYY-MM-DD'.
// → { músculo: { state, lastDate, sets, daysSince, windowDays, daysLeft } }
//   state: 'none' (sem treino no período) | 'tired' | 'recovering' | 'ready'
export function muscleRecovery(sets, today, libraryMap = null) {
  const byMuscle = Object.fromEntries(MUSCLES.map(m => [m, new Map()]));
  (sets || []).forEach(s => {
    if (!s.workout_date || s.workout_date > today) return;
    const m = muscleOfName(s.exercise_name, libraryMap);
    if (!m) return;
    byMuscle[m].set(s.workout_date, (byMuscle[m].get(s.workout_date) || 0) + 1);
  });

  const todayN = dayNumber(today);
  return Object.fromEntries(MUSCLES.map(m => {
    const days = byMuscle[m];
    if (!days.size) return [m, { state: 'none', lastDate: null, sets: 0, daysSince: null, windowDays: null, daysLeft: 0 }];
    const lastDate = [...days.keys()].sort().pop();
    const lastN = dayNumber(lastDate);
    // Dia seguido ao anterior soma o cansaço: conta as séries do último dia e do dia antes dele.
    const recentSets = [...days].filter(([d]) => dayNumber(d) >= lastN - 1).reduce((a, [, n]) => a + n, 0);
    const windowDays = recoveryWindowDays(m, recentSets);
    const daysSince = todayN - lastN;
    const state = daysSince >= windowDays ? 'ready' : daysSince * 2 >= windowDays ? 'recovering' : 'tired';
    return [m, { state, lastDate, sets: days.get(lastDate), daysSince, windowDays, daysLeft: Math.max(0, windowDays - daysSince) }];
  }));
}

// Músculos em um estado, do que falta mais para o que falta menos (empate: ordem fixa dos músculos).
export function musclesIn(recovery, state) {
  return MUSCLES
    .filter(m => recovery[m].state === state)
    .sort((a, b) => recovery[b].daysLeft - recovery[a].daysLeft);
}
