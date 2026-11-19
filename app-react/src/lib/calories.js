// Estimativa de calorias queimadas pelo método MET (Compêndio de Atividades Físicas):
// kcal = MET × peso (kg) × horas. É uma estimativa, não uma medida.

const MIN_KG = 30;
const MAX_KG = 300;

// Peso do perfil (user_metadata.peso) em kg, ou null se faltar ou for inválido.
export function weightFromMeta(meta) {
  const kg = parseFloat(String(meta?.peso ?? '').replace(',', '.'));
  return Number.isFinite(kg) && kg >= MIN_KG && kg <= MAX_KG ? kg : null;
}

// MET da corrida pela velocidade média (km/h), tabela do Compêndio.
export function runMet(speedKmh) {
  if (!(speedKmh > 0)) return null;
  if (speedKmh < 6.4) return 6;
  if (speedKmh < 8) return 8.3;
  if (speedKmh < 9.7) return 9.8;
  if (speedKmh < 11.3) return 10.5;
  if (speedKmh < 12.9) return 11.8;
  if (speedKmh < 14.5) return 12.8;
  if (speedKmh < 16.1) return 14.5;
  return 16;
}

function kcal(met, kg, seconds) {
  if (!met || !kg || !(seconds > 0)) return null;
  return Math.round(met * kg * (seconds / 3600));
}

// Corrida: null sem peso, sem distância ou sem tempo.
export function runCalories({ distance_m, duration_s }, kg) {
  if (!(distance_m > 0) || !(duration_s > 0)) return null;
  const speedKmh = (distance_m / 1000) / (duration_s / 3600);
  return kcal(runMet(speedKmh), kg, duration_s);
}

// Musculação: MET 3,5 (leve) a 6 (vigoroso) conforme as séries por minuto;
// sem séries registradas usa 5, o valor geral de treino de força.
export function strengthCalories({ durationSeconds, doneSets }, kg) {
  if (!(durationSeconds > 0)) return null;
  let met = 5;
  if (doneSets > 0) {
    const perMin = doneSets / (durationSeconds / 60);
    met = perMin >= 0.4 ? 6 : perMin >= 0.2 ? 5 : 3.5;
  }
  return kcal(met, kg, durationSeconds);
}
