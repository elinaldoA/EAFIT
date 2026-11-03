// Lembrete de hidratação do modo treino, como nos relógios esportivos: a cada
// 15 min de treino ativo (o cronômetro do treino, que não conta as pausas).
// Para não interromper uma série, o aviso espera o próximo descanso — mas, se
// ele não vier em 3 min (cardio, série longa), aparece mesmo assim.

export const HYDRATION_EVERY_MS = 15 * 60 * 1000;
export const HYDRATION_MAX_WAIT_MS = 3 * 60 * 1000;
// Some sozinho se ninguém tocar: é um lembrete, não um bloqueio.
export const HYDRATION_SHOW_MS = 60 * 1000;
export const HYDRATION_SIP_ML = 200;

// Próximo marco depois do tempo atual — quem reabre o treino aos 20 min não
// recebe um aviso atrasado na hora, só aos 30.
export function nextHydrationAt(elapsedMs) {
  return (Math.floor(Math.max(0, elapsedMs) / HYDRATION_EVERY_MS) + 1) * HYDRATION_EVERY_MS;
}

export function shouldRemindHydration({ elapsedMs, nextAt, resting }) {
  if (elapsedMs < nextAt) return false;
  return resting || elapsedMs >= nextAt + HYDRATION_MAX_WAIT_MS;
}

export function isWorkoutHydrationOn(user) {
  return user?.user_metadata?.notifyWorkoutWater !== false;
}
