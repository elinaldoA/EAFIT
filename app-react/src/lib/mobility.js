import { todayDate } from '../data/treinoData';

// Mobilidade e alongamento guiados, montados pelos músculos do dia.
// Os movimentos são os de grupo "mobilidade" de public.exercise_library, com
// o mesmo nome e a mesma técnica de lá (é o que tEx/tTec traduzem e o que o
// ExerciseDemo encontra). Ficam fora os que pedem rolo ou bastão.
// Antes do treino: movimentos dinâmicos (por repetição); depois: alongamentos
// parados. Músculos = as chaves do BodyAvatar (data/bodyMuscleMap.js).
// dose: como está na biblioteca; secs: segundos por lado quando a contagem
// pela dose (3s por repetição) ficaria curta demais para o movimento.

export const ALL_MUSCLES = ['chest', 'shoulders', 'triceps', 'back', 'biceps', 'abs', 'quads', 'calves', 'hamstrings', 'glutes'];

export const MOBILITY_MOVES = [
  // Antes do treino
  { nome: 'Gato-Vaca', dose: '10', tecnica: 'Em 4 apoios, arredonda e arqueia a coluna', fase: 'pre', musculos: ['back', 'abs'], abre: true },
  { nome: 'Maior Alongamento do Mundo', dose: '5 cada lado', secs: 30, tecnica: 'Afundo, cotovelo ao chão e braço pro teto', fase: 'pre', musculos: ['quads', 'hamstrings', 'glutes', 'back'] },
  { nome: 'Minhoca (Inchworm)', dose: '8', secs: 40, tecnica: 'Caminha com as mãos até a prancha e volta', fase: 'pre', musculos: ['hamstrings', 'shoulders', 'abs'] },
  { nome: 'Rotação Torácica em 4 Apoios', dose: '10 cada lado', tecnica: 'Mão na nuca, cotovelo gira pro teto', fase: 'pre', musculos: ['back', 'shoulders'] },
  { nome: 'Livro Aberto', dose: '10 cada lado', tecnica: 'Deitado de lado, braço de cima abre pro outro lado', fase: 'pre', musculos: ['chest', 'back'] },
  { nome: 'Círculos de Ombro', dose: '8 cada lado', tecnica: 'Braço estendido gira devagar, tronco parado', fase: 'pre', musculos: ['shoulders'] },
  { nome: 'Abraço e Abertura de Braços', dose: '12', tecnica: 'Abraça o corpo e abre os braços, alternando', fase: 'pre', musculos: ['chest', 'shoulders'] },
  { nome: 'Agulha em 4 Apoios', dose: '8 cada lado', tecnica: 'Um braço passa por baixo do tronco até o ombro tocar o chão', fase: 'pre', musculos: ['back', 'shoulders'] },
  { nome: 'Círculos de Punho', dose: '10 cada lado', tecnica: 'Mãos entrelaçadas giram nos dois sentidos', fase: 'pre', musculos: ['biceps', 'triceps'] },
  { nome: 'Mobilidade de Punho em 4 Apoios', dose: '10', tecnica: 'Mãos no chão, balança o corpo pra frente e pra trás', fase: 'pre', musculos: ['biceps', 'triceps', 'chest'] },
  { nome: 'Mobilidade de Quadril 90/90', dose: '8 cada lado', tecnica: 'Sentado, joelhos tombam de um lado pro outro', fase: 'pre', musculos: ['glutes', 'hamstrings'] },
  { nome: 'Círculos de Quadril', dose: '8 cada lado', tecnica: 'Em 4 apoios, o joelho desenha o maior círculo possível', fase: 'pre', musculos: ['glutes'] },
  { nome: 'Mobilidade de Tornozelo na Parede', dose: '10 cada lado', tecnica: 'Joelho toca a parede sem o calcanhar sair do chão', fase: 'pre', musculos: ['calves', 'quads'] },
  { nome: 'Balanço de Pernas Frontal', dose: '12 cada perna', tecnica: 'Apoiado, a perna balança pra frente e pra trás', fase: 'pre', musculos: ['hamstrings', 'quads'] },
  { nome: 'Balanço de Pernas Lateral', dose: '12 cada perna', tecnica: 'Apoiado, a perna balança de um lado pro outro', fase: 'pre', musculos: ['glutes', 'quads'] },
  { nome: 'Afundo com Alcance Lateral', dose: '6 cada lado', secs: 30, tecnica: 'No afundo, o braço de trás alcança por cima da cabeça', fase: 'pre', musculos: ['quads', 'glutes', 'abs'] },
  { nome: 'Caminhada do Soldado', dose: '10 cada perna', tecnica: 'Chuta a perna estendida até a mão oposta', fase: 'pre', musculos: ['hamstrings'] },
  { nome: 'Caminhada Abraçando o Joelho', dose: '10 cada perna', tecnica: 'A cada passo, abraça um joelho no peito', fase: 'pre', musculos: ['glutes'] },
  { nome: 'Rotação de Tronco em Pé', dose: '10 cada lado', tecnica: 'Braços soltos, gira de um lado ao outro', fase: 'pre', musculos: ['abs', 'back'] },
  { nome: 'Agachamento Profundo Sustentado', dose: '45s', tecnica: 'Calcanhares no chão, cotovelos abrem os joelhos', fase: 'pre', musculos: ['quads', 'glutes', 'calves'] },

  // Depois do treino
  { nome: 'Postura da Criança', dose: '45s', tecnica: 'Senta nos calcanhares, braços à frente', fase: 'pos', musculos: ['back', 'shoulders'], abre: true },
  { nome: 'Alongamento de Peitoral na Parede', dose: '30s cada lado', tecnica: 'Antebraço na parede, gira o tronco pro outro lado', fase: 'pos', musculos: ['chest'] },
  { nome: 'Alongamento de Ombro Cruzado', dose: '30s cada lado', tecnica: 'Braço cruza o peito, a outra mão puxa', fase: 'pos', musculos: ['shoulders'] },
  { nome: 'Alongamento de Tríceps', dose: '30s cada lado', tecnica: 'Cotovelo aponta pro teto, mão entre as escápulas', fase: 'pos', musculos: ['triceps'] },
  { nome: 'Alongamento de Bíceps na Parede', dose: '30s cada lado', tecnica: 'Palma na parede, braço estendido atrás', fase: 'pos', musculos: ['biceps'] },
  { nome: 'Alongamento de Dorsal no Apoio', dose: '30s', tecnica: 'Mãos num apoio, quadril vai pra trás', fase: 'pos', musculos: ['back'] },
  { nome: 'Postura do Filhote', dose: '30s', tecnica: 'Quadril sobre os joelhos, peito desce ao chão', fase: 'pos', musculos: ['shoulders', 'chest'] },
  { nome: 'Postura da Esfinge', dose: '30s', tecnica: 'Antebraços no chão, peito à frente', fase: 'pos', musculos: ['abs'] },
  { nome: 'Torção de Coluna Deitado', dose: '30s cada lado', tecnica: 'Joelho cruza o corpo, ombros no chão', fase: 'pos', musculos: ['back', 'glutes'] },
  { nome: 'Alongamento Lateral de Tronco', dose: '30s cada lado', tecnica: 'Braço acima da cabeça, inclina pro lado', fase: 'pos', musculos: ['abs', 'back'] },
  { nome: 'Alongamento de Posterior Deitado', dose: '30s cada perna', tecnica: 'Deitado, puxa a perna estendida com uma toalha', fase: 'pos', musculos: ['hamstrings'] },
  { nome: 'Alongamento de Quadríceps em Pé', dose: '30s cada lado', tecnica: 'Segura o pé atrás, joelhos juntos', fase: 'pos', musculos: ['quads'] },
  { nome: 'Alongamento de Flexor de Quadril Ajoelhado', dose: '30s cada lado', tecnica: 'Um joelho no chão, quadril avança', fase: 'pos', musculos: ['quads', 'abs'] },
  { nome: 'Alongamento de Glúteo (Figura 4)', dose: '30s cada lado', tecnica: 'Tornozelo sobre o joelho oposto, puxa a perna', fase: 'pos', musculos: ['glutes'] },
  { nome: 'Alongamento do Pombo', dose: '45s cada lado', tecnica: 'Perna da frente dobrada, a de trás estendida', fase: 'pos', musculos: ['glutes', 'quads'] },
  { nome: 'Alongamento de Adutores em Pé', dose: '30s cada lado', tecnica: 'Base larga, dobra um joelho e estende o outro', fase: 'pos', musculos: ['quads', 'glutes'] },
  { nome: 'Alongamento de Panturrilha na Parede', dose: '30s cada lado', tecnica: 'Perna de trás estendida, calcanhar no chão', fase: 'pos', musculos: ['calves'] },
  { nome: 'Alongamento de Sóleo na Parede', dose: '30s cada lado', tecnica: 'Joelho de trás flexionado, calcanhar no chão', fase: 'pos', musculos: ['calves'] },
  { nome: 'Joelhos ao Peito Deitado', dose: '30s', tecnica: 'Abraça os joelhos, lombar relaxa', fase: 'pos', musculos: ['back', 'glutes'] },
  { nome: 'Respiração Diafragmática', dose: '10', secs: 50, tecnica: 'Mão na barriga, inspira pelo nariz e solta devagar', fase: 'pos', musculos: [], fecha: true },
];

const SECONDS_PER_REP = 3;
const MIN_SIDE_SECONDS = 20;
export const TRANSITION_SECONDS = 5; // para se posicionar no próximo

// { seconds (total), sides } a partir da dose: "30s cada lado" = 2 × 30s,
// "10 cada lado" = 2 × 30s, "45s" = 45s, "10" = 30s.
export function moveTiming(move) {
  const dose = String(move.dose || '');
  const sides = /cada (lado|perna)/i.test(dose);
  const secMatch = dose.match(/(\d+)\s*s\b/);
  const repMatch = dose.match(/^(\d+)/);
  let perSide = move.secs
    || (secMatch ? parseInt(secMatch[1], 10) : (repMatch ? parseInt(repMatch[1], 10) * SECONDS_PER_REP : MIN_SIDE_SECONDS));
  perSide = Math.max(MIN_SIDE_SECONDS, perSide);
  return { seconds: perSide * (sides ? 2 : 1), sides };
}

export function routineSeconds(moves) {
  return moves.reduce((acc, m) => acc + moveTiming(m).seconds + TRANSITION_SECONDS, 0);
}

function rotate(list, seed) {
  if (!list.length) return list;
  const k = ((seed % list.length) + list.length) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

function dateSeed(date = todayDate()) {
  return date.split('-').reduce((acc, p) => acc * 31 + parseInt(p, 10), 7);
}

// Rotina para os músculos do dia (Set ou array de chaves do BodyAvatar; vazio
// = corpo todo), cabendo em ~`minutes`. Começa por um movimento geral, cobre
// um músculo de cada vez (os do dia, na ordem) e, sobrando tempo, repete a
// volta. O depois do treino termina sempre com a respiração. A seed (a data,
// por padrão) varia os movimentos de um dia para o outro.
export function buildMobilityRoutine(muscles, phase, minutes = 5, seed = dateSeed()) {
  const targets = [...(muscles && [...muscles].length ? muscles : ALL_MUSCLES)].filter(m => ALL_MUSCLES.includes(m));
  const order = targets.length ? targets : ALL_MUSCLES;
  const pool = rotate(MOBILITY_MOVES.filter(m => m.fase === phase && !m.abre && !m.fecha), seed);
  const opener = MOBILITY_MOVES.find(m => m.fase === phase && m.abre);
  const closer = MOBILITY_MOVES.find(m => m.fase === phase && m.fecha);
  const budget = minutes * 60 - (closer ? moveTiming(closer).seconds + TRANSITION_SECONDS : 0);

  const picked = opener ? [opener] : [];
  const fits = move => routineSeconds([...picked, move]) <= budget;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const muscle of order) {
      const move = pool.find(m => !picked.includes(m) && m.musculos.includes(muscle) && fits(m));
      if (move) { picked.push(move); progressed = true; }
    }
  }
  if (closer) picked.push(closer);
  return picked;
}

const DONE_KEY = phase => `mobility_${todayDate()}_${phase}`;

export function isMobilityDone(phase) {
  try { return localStorage.getItem(DONE_KEY(phase)) === 'true'; } catch { return false; }
}

// Marca hoje e apaga as marcas de outros dias (só a de hoje importa).
export function markMobilityDone(phase) {
  try {
    const today = `mobility_${todayDate()}_`;
    Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .filter(k => k?.startsWith('mobility_') && !k.startsWith(today))
      .forEach(k => localStorage.removeItem(k));
    localStorage.setItem(DONE_KEY(phase), 'true');
  } catch { /* sem storage */ }
}
