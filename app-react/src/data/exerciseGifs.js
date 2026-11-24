// GIFs próprios da EAFIT (public/gifs/<arquivo>.gif) por nome de exercício.
// Têm prioridade sobre vídeo, YouTube e os 2 quadros do Free Exercise DB
// (ver getExerciseMedia em exerciseMedia.js); só a mídia enviada pelo admin
// ganha deles. Não entram no precache do service worker.
export const EXERCISE_GIFS = {
  'Abdominal Polia (Corda)': 'Abdominal Polia (Corda)',
  'Crucifixo Máquina': 'Crucifixo Máquina',
  'Desenvolvimento com Barra': 'Desenvolvimento com barra',
  'Prancha com Peso': 'Prancha com Peso',
  'Elevação de Pernas Pendurado': 'Elevação de Pernas Pendurado',
  'Elevação Lateral com Halteres': 'Elevação lateral com halteres',
  'Supino Inclinado com Halteres': 'Supino Inclinado com Halteres',
  'Supino Reto com Barra': 'Supino Reto com Barra',
  'Tríceps Corda na Polia': 'Tríceps Corda na Polia',
  'Tríceps Testa com Barra W': 'Tríceps Testa com Barra W',
};

export const gifUrl = (file, base) => `${base}gifs/${encodeURIComponent(file)}.gif`;

// Mesmo exercício com GIF diferente conforme a técnica anotada na ficha
// (ex.: o 2º Crucifixo Máquina do dia, "Foco no encurtamento, pico de contração").
const GIF_VARIANTS = {
  'Crucifixo Máquina': [{ tecnica: /encurtamento/i, file: 'Crucifixo Máquina - foco encurtamento pico contração' }],
};

export function gifFileFor(key, tecnica) {
  const variant = GIF_VARIANTS[key]?.find(v => v.tecnica.test(tecnica || ''));
  return variant ? variant.file : EXERCISE_GIFS[key];
}
