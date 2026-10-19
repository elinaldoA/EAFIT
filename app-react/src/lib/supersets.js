import { parseRestSeconds } from './utils';
import { t } from './i18n';

// Bi-set (2), tri-set (3) e circuito (4+): exercícios SEGUIDOS do plano com a
// mesma letra em `grupo` (plan_exercises.grupo, migration
// 20261115010000_superset_warmup_hr.sql). Faz-se uma série de cada, em
// sequência e sem descanso; o descanso entra só ao fechar a volta.
// Mesma letra fora de sequência conta como grupos separados, e um grupo de um
// exercício só (ou de itens sem séries) é tratado como exercício avulso.

export const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function setCount(ex) {
  return parseInt(ex?.series, 10) || 0;
}

function letterOf(ex) {
  const g = String(ex?.grupo || '').trim().toUpperCase();
  return /^[A-Z]$/.test(g) && setCount(ex) > 0 ? g : '';
}

// Lista do dia em blocos, na ordem do plano:
//   { type: 'single', ex } | { type: 'group', letter, members: [ex, ...] }
export function segmentExercises(exercicios = []) {
  const out = [];
  exercicios.forEach(ex => {
    const letter = letterOf(ex);
    const last = out[out.length - 1];
    if (letter && last?.letter === letter) {
      if (last.type === 'single') out[out.length - 1] = { type: 'group', letter, members: [last.ex, ex] };
      else last.members.push(ex);
      return;
    }
    out.push({ type: 'single', ex, letter });
  });
  return out.map(s => (s.type === 'single' ? { type: 'single', ex: s.ex } : s));
}

// Grupo do exercício (pelo nome) ou null quando é avulso.
export function findGroup(exercicios, nome) {
  return segmentExercises(exercicios).find(s => s.type === 'group' && s.members.some(m => m.nome === nome)) || null;
}

export function groupKindLabel(size) {
  if (size >= 4) return t('Circuito');
  return size === 3 ? t('Tri-set') : t('Bi-set');
}

// Descanso da volta: o do último exercício do grupo; se ele não tiver (é comum
// zerar o descanso dos de dentro), o maior entre os membros.
export function groupRestSeconds(group) {
  const last = parseRestSeconds(group.members[group.members.length - 1].descanso);
  return last > 0 ? last : Math.max(0, ...group.members.map(m => parseRestSeconds(m.descanso)));
}

// Depois de marcar a série `n` de `nome` dentro do grupo: para onde ir e se
// descansa. isDone(nome, n) diz se a série já está marcada (o localStorage já
// tem o check desta). Devolve:
//   { rest: false, next }      ainda falta alguém nesta volta: vai direto
//   { rest: true, seconds, next } fechou a volta (next = 1º da próxima volta,
//                                ou null se o grupo acabou)
export function nextInGroup(group, nome, n, isDone) {
  const idx = group.members.findIndex(m => m.nome === nome);
  const pendingIn = (m, round) => round <= setCount(m) && !isDone(m.nome, round);

  const sameRound = group.members.slice(idx + 1).find(m => pendingIn(m, n));
  if (sameRound) return { rest: false, next: sameRound.nome };

  let next = null;
  const rounds = Math.max(...group.members.map(setCount));
  for (let r = 1; r <= rounds && !next; r++) {
    next = group.members.find(m => pendingIn(m, r))?.nome || null;
  }
  return { rest: true, seconds: groupRestSeconds(group), next };
}
