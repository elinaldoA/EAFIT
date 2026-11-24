// GIFs próprios da EAFIT (public/gifs/<arquivo>.gif) por nome de exercício.
// Têm prioridade sobre vídeo, YouTube e os 2 quadros do Free Exercise DB
// (ver getExerciseMedia em exerciseMedia.js); só a mídia enviada pelo admin
// ganha deles. Não entram no precache do service worker.
export const EXERCISE_GIFS = {
  'Abdominal Polia (Corda)': 'Abdominal Polia (Corda)',
  'Desenvolvimento com Barra': 'Desenvolvimento com barra',
  'Elevação de Pernas Pendurado': 'Elevação de Pernas Pendurado',
  'Elevação Lateral com Halteres': 'Elevação lateral com halteres',
  'Supino Inclinado com Halteres': 'Supino Inclinado com Halteres',
  'Supino Reto com Barra': 'Supino Reto com Barra',
  'Tríceps Corda na Polia': 'Tríceps Corda na Polia',
  'Tríceps Testa com Barra W': 'Tríceps Testa com Barra W',
};

export const gifUrl = (file, base) => `${base}gifs/${encodeURIComponent(file)}.gif`;
