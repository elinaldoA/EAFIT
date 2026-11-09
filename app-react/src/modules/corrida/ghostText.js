import { ghostGapS } from './ghost';
import { formatClock } from './runs';
import { fmtDate } from '../../lib/utils';
import { t } from '../../lib/i18n';

// Textos do fantasma (ghost.js): na tela, no resultado e na voz.

// Quem é o fantasma, em poucas palavras: "Parque · 01/10".
export function ghostName(ghost) {
  const when = ghost.date ? fmtDate(ghost.date) : '';
  return [ghost.title, when].filter(Boolean).join(' · ') || t('corrida anterior');
}

// "12 s" ou "1:05".
export const amountOf = abs => (abs < 60 ? t('{v1} s', { v1: abs }) : formatClock(abs));

// "12 s à frente", "1:05 atrás" ou "no mesmo ponto".
export function gapText(gapS) {
  const abs = Math.abs(gapS);
  if (abs < 2) return t('no mesmo ponto');
  const amount = amountOf(abs);
  return gapS > 0 ? t('{v1} à frente', { v1: amount }) : t('{v1} atrás', { v1: amount });
}

// Frase falada no aviso de cada km.
export function gapSpoken(gapS) {
  const abs = Math.abs(gapS);
  if (abs < 2) return t('Junto do fantasma.');
  const amount = abs < 60 ? t('{v1} segundos', { v1: abs }) : t('{v1} minutos e {v2} segundos', { v1: Math.floor(abs / 60), v2: abs % 60 });
  return gapS > 0 ? t('{v1} à frente do fantasma.', { v1: amount }) : t('{v1} atrás do fantasma.', { v1: amount });
}

// Resultado no fim da corrida. null com menos de 100 m (nada a comparar).
export function ghostResultText(ghost, totalS, meters) {
  if (!(meters >= 100)) return null;
  const gap = ghostGapS(ghost, totalS, meters);
  if (Math.abs(gap) < 2) return t('Empate com {v1}.', { v1: ghostName(ghost) });
  return gap > 0
    ? t('🎉 {v1} mais rápido que {v2}.', { v1: amountOf(gap), v2: ghostName(ghost) })
    : t('{v1} mais lento que {v2}.', { v1: amountOf(-gap), v2: ghostName(ghost) });
}
