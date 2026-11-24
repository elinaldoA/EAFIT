// GIFs próprios da EAFIT (public/gifs/<arquivo>.gif) por nome de exercício.
// Têm prioridade sobre vídeo, YouTube e os 2 quadros do Free Exercise DB
// (ver getExerciseMedia em exerciseMedia.js); só a mídia enviada pelo admin
// ganha deles. Não entram no precache do service worker.
export const EXERCISE_GIFS = {
  'Abdominal Polia (Corda)': 'Abdominal Polia (Corda)',
  'Crucifixo Máquina': 'Crucifixo Máquina',
  'Desenvolvimento com Barra': 'Desenvolvimento com barra',
  'Prancha com Peso': 'Prancha com Peso',
  'Cardio — Esteira Inclinada': 'Cardio — Esteira Inclinada',
  'Face Pull': 'Face Pull',
  'Pulldown Neutro (Triângulo)': 'Pulldown Neutro (Triângulo)',
  'Puxada Aberta Frente': 'Puxada Aberta Frente',
  'Remada Curvada com Barra': 'Remada Curvada com Barra',
  'Remada Unilateral com Halter': 'Remada Unilateral com Halter',
  'Rosca Direta Barra W': 'Rosca Direta Barra W',
  'Rosca Inversa com Barra': 'Rosca Inversa com Barra',
  'Elevação de Pernas Pendurado': 'Elevação de Pernas Pendurado',
  'Elevação Lateral com Halteres': 'Elevação lateral com halteres',
  'Supino Inclinado com Halteres': 'Supino Inclinado com Halteres',
  'Supino Reto com Barra': 'Supino Reto com Barra',
  'Tríceps Corda na Polia': 'Tríceps Corda na Polia',
  'Tríceps Testa com Barra W': 'Tríceps Testa com Barra W',
};

// Os GIFs mantêm o nome ao serem trocados; o ?v= faz o navegador buscar de novo.
// Subir o número sempre que um GIF for substituído por outro com o mesmo nome.
export const GIFS_VERSION = 2;

export const gifUrl = (file, base) => `${base}gifs/${encodeURIComponent(file)}.gif?v=${GIFS_VERSION}`;

// Mesmo exercício com GIF diferente conforme a técnica anotada na ficha
// (ex.: o 2º Crucifixo Máquina do dia, "Foco no encurtamento, pico de contração").
const GIF_VARIANTS = {
  'Crucifixo Máquina': [{ tecnica: /encurtamento/i, file: 'Crucifixo Máquina - foco encurtamento pico contração' }],
};

export function gifFileFor(key, tecnica) {
  const variant = GIF_VARIANTS[key]?.find(v => v.tecnica.test(tecnica || ''));
  return variant ? variant.file : EXERCISE_GIFS[key];
}
