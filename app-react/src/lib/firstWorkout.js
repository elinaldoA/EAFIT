import { DAY_NAMES } from '../data/treinoData';

// Qual dia do plano oferecer para o primeiro treino de quem acabou de chegar:
// o de hoje, se tem exercício; senão o próximo da semana (domingo a sábado,
// como o resto do app) e, passando do último, o primeiro. Sem isso, quem cria
// a conta num dia de descanso do plano só via "Dia de recuperação" e nenhum
// botão para começar. `hasWork(day)` diz se o dia tem séries.
export function pickFirstWorkoutDay(planDays, today, hasWork) {
  const days = (planDays || []).filter(d => DAY_NAMES.includes(d.dia) && hasWork(d));
  if (!days.length) return null;
  const todayIdx = DAY_NAMES.indexOf(today);
  const idx = d => DAY_NAMES.indexOf(d.dia);
  const sorted = [...days].sort((a, b) => idx(a) - idx(b));
  return sorted.find(d => idx(d) >= todayIdx) || sorted[0];
}
