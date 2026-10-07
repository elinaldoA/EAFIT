// Itens de cardio do plano (esteira, corrida, bike...) não têm séries: guardam
// duração e distância numa linha de exercise_sets com set_number = 1.

const CARDIO_RE = /cardio|corrida|esteira|bike|bicicleta|caminhada|escada|hiit|longão|longao|fartlek|trote|elíptico|eliptico|remo|transport/i;

export function isCardioItem(ex) {
  if (!ex || parseInt(ex.series, 10) > 0) return false;
  return ex.nome.startsWith('🏃') || CARDIO_RE.test(ex.nome);
}

// Primeiro "NNmin" do texto do plano ("20min · Moderado" -> 20).
export function parsePlannedMinutes(reps) {
  const m = String(reps || '').match(/(\d+)\s*min/i);
  return m ? parseInt(m[1], 10) : null;
}

// Aceita vírgula decimal; vazio/inválido/negativo vira null.
export function toPositive(val) {
  const n = parseFloat(String(val ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Ritmo em min/km ("5:30"); null sem duração ou distância válidas.
export function formatPace(durationMin, distanceKm) {
  const d = toPositive(durationMin);
  const km = toPositive(distanceKm);
  if (!d || !km) return null;
  const total = Math.round((d / km) * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatCardioSummary(durationMin, distanceKm) {
  const d = toPositive(durationMin);
  const km = toPositive(distanceKm);
  const parts = [];
  if (d) parts.push(`${d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`);
  if (km) parts.push(`${km.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`);
  const pace = formatPace(d, km);
  if (pace) parts.push(`${pace}/km`);
  return parts.join(' · ');
}

const key = (nome, field) => `set_${nome}_1_${field}`;

export function readCardio(nome) {
  return {
    duracao: localStorage.getItem(key(nome, 'duracao')) || '',
    distancia: localStorage.getItem(key(nome, 'distancia')) || '',
    done: localStorage.getItem(key(nome, 'done')) === 'true',
  };
}

export function writeCardioField(nome, field, value) {
  localStorage.setItem(key(nome, field), value);
}
