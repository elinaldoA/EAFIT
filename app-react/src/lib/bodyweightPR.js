import { checkForBodyweightPR, progressionOf } from './bodyweight';
import { isTimedItem, formatSeconds } from './timedSets';
import { noteRecord } from './coach';

import { t, tEx } from './i18n';
// Ao concluir uma série sem carga (calistenia), avisa se bateu o recorde de
// repetições ou de tempo daquele exercício. Só vale para os exercícios das
// cadeias de progressão e os por tempo, pra não consultar o histórico à toa.
export function tracksBodyweightRecords(ex) {
  return !!progressionOf(ex.nome) || isTimedItem(ex);
}

export async function announceBodyweightPR({ userId, ex, day, reps, duracaoS, exclude, toast }) {
  if (!userId || !tracksBodyweightRecords(ex)) return null;
  try {
    const pr = await checkForBodyweightPR(userId, ex.nome, { reps, duracaoS }, exclude);
    if (!pr) return null;
    const value = pr.kind === 'time' ? formatSeconds(pr.value) : t('{n} reps', { n: pr.value });
    toast(t('🏆 Novo recorde em {nome}: {valor}!', { nome: tEx(ex.nome), valor: value }));
    noteRecord(day.dia, ex.nome);
    return pr;
  } catch (err) {
    console.error('announceBodyweightPR:', err);
    return null;
  }
}
