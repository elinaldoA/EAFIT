// Pausa automática do EAFIT Run: para o cronômetro quando a pessoa fica parada
// (semáforo, amarrar o tênis) e volta sozinha quando ela anda de novo. Decide
// pelas leituras do GPS já classificadas por geoTrack.js:
//
// - Parada: leituras boas recusadas como "deriva" (o sinal chega, mas a
//   posição não muda) por pelo menos STILL_MS desde o último movimento. Sinal
//   perdido não manda leitura nenhuma, então não vira pausa.
// - Volta: em pausa, pelo menos dois deslocamentos aceitos somando RESUME_M em
//   RESUME_WINDOW_MS. Um salto isolado do GPS parado não retoma a corrida.
//
// O cronômetro para no momento do último movimento, não no da decisão: os
// segundos parados não entram no tempo nem no ritmo.

export const STILL_MS = 10000;
export const STILL_FIXES = 2;
export const RESUME_M = 15;
export const RESUME_MOVES = 2;
export const RESUME_WINDOW_MS = 15000;

export const emptyMotion = () => ({ lastMoveAt: null, still: 0, moves: [] });

// sample: { t (ms), reason (geoTrack.applyFix), meters (deslocamento aceito) }.
// paused: a corrida está em pausa automática. since: início do trecho atual
// (ms): o "último movimento" nunca é anterior a ele.
// Devolve { motion, action }, com action null | { type: 'pause', at } | { type: 'resume' }.
export function motionStep(motion, sample, paused, since = 0) {
  const { t, reason } = sample;
  if (paused) {
    if (reason !== 'moved') return { motion, action: null };
    const moves = [...motion.moves.filter(m => t - m.t <= RESUME_WINDOW_MS), { t, m: sample.meters || 0 }];
    const sum = moves.reduce((acc, m) => acc + m.m, 0);
    if (moves.length >= RESUME_MOVES && sum >= RESUME_M) {
      return { motion: { lastMoveAt: t, still: 0, moves: [] }, action: { type: 'resume' } };
    }
    return { motion: { ...motion, moves }, action: null };
  }
  if (reason === 'moved' || reason === 'first' || reason === 'jump') {
    return { motion: { lastMoveAt: t, still: 0, moves: [] }, action: null };
  }
  if (reason !== 'drift' || motion.lastMoveAt == null) return { motion, action: null };
  const lastMove = Math.max(motion.lastMoveAt, since);
  const still = motion.still + 1;
  if (still >= STILL_FIXES && t - lastMove >= STILL_MS) {
    return { motion: { ...motion, still: 0, moves: [] }, action: { type: 'pause', at: lastMove } };
  }
  return { motion: { ...motion, still }, action: null };
}
