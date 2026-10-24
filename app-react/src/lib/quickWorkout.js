import { todayDate } from '../data/treinoData';
import { parseRestSeconds } from './utils';
import { isCardioItem, parsePlannedMinutes } from './cardio';
import { warmupCount } from './warmup';
import { segmentExercises, groupRestSeconds, GROUP_LETTERS } from './supersets';

// Treino no tempo que a pessoa tem: estima a duração do treino do dia e, se
// ela escolher um tempo menor, enxuga o dia até caber. A versão curta vale só
// hoje e só neste aparelho (chave quick_workout com a data): amanhã o plano
// volta inteiro sozinho, e o plano salvo nunca é alterado.
// Como as séries ficam guardadas por nome do exercício e número da série,
// cortar a Série 4 só a esconde — nada do que já foi registrado se perde.

const WORK_SECONDS = 40; // execução de uma série
const SETUP_SECONDS = 60; // ajustar o aparelho e trocar de exercício
const WARMUP_SECONDS = 45; // cada série de aquecimento, já com a pausa
const MIN_ACCESSORY_SETS = 2;
const MIN_MAIN_SETS = 3;
const MAIN_COUNT = 2; // os dois primeiros do dia são os principais: nunca saem

export const QUICK_OPTIONS = [20, 30, 45];
const STORAGE_KEY = 'quick_workout';

function sets(ex) {
  return parseInt(ex.series, 10) || 0;
}

function itemSeconds(ex) {
  if (isCardioItem(ex)) return (parsePlannedMinutes(ex.reps) || 0) * 60;
  const n = sets(ex);
  if (!n) return 0;
  return SETUP_SECONDS + n * WORK_SECONDS + (n - 1) * parseRestSeconds(ex.descanso);
}

// Segundos estimados do dia: séries, descansos, troca de aparelho, aquecimento
// e o pós-treino. Bi-set/circuito descansa uma vez por volta.
export function estimateSeconds(day) {
  let total = 0;
  segmentExercises(day.exercicios).forEach(seg => {
    if (seg.type === 'single') {
      total += itemSeconds(seg.ex);
      return;
    }
    const rounds = Math.max(...seg.members.map(sets));
    const work = seg.members.reduce((acc, m) => acc + sets(m) * WORK_SECONDS, 0);
    total += seg.members.length * SETUP_SECONDS + work + (rounds - 1) * groupRestSeconds(seg);
  });
  day.exercicios.forEach((ex, i) => { total += warmupCount(ex, i) * WARMUP_SECONDS; });
  day.pos.forEach(ex => { total += itemSeconds(ex); });
  return total;
}

export function estimateMinutes(day) {
  return Math.round(estimateSeconds(day) / 60);
}

// Maior série já marcada do exercício: dali pra baixo nada é cortado.
function doneUpTo(nome, isDone) {
  let last = 0;
  for (let n = 1; n <= 12; n++) if (isDone(nome, n)) last = n;
  return last;
}

function defaultIsDone(nome, n) {
  try { return localStorage.getItem(`set_${nome}_${n}_done`) === 'true'; } catch { return false; }
}

// Enxuga o dia até caber em `minutes`, nesta ordem (para no primeiro passo que
// já basta):
//   1. tira o pós-treino (cardio e abdômen);
//   2. junta os acessórios em bi-sets (descanso só no fim da volta);
//   3. reduz os acessórios a 2 séries, do último para o primeiro;
//   4. tira acessórios, do último para o primeiro;
//   5. reduz os principais a 3 séries e deixa só 1 série de aquecimento.
// Nunca corta série já marcada nem tira exercício com série marcada.
// Devolve { day, minutes, changes }, com changes = [{ type, ... }] para a tela.
export function fitDayToTime(day, minutes, isDone = defaultIsDone) {
  const budget = minutes * 60;
  const exercicios = day.exercicios.map(ex => ({ ...ex }));
  let pos = [...day.pos];
  const changes = [];
  const current = () => ({ ...day, exercicios, pos });
  const fits = () => estimateSeconds(current()) <= budget;
  const locked = ex => doneUpTo(ex.nome, isDone);

  if (!fits()) {
    const keep = pos.filter(ex => locked(ex) > 0);
    if (keep.length < pos.length) {
      changes.push({ type: 'pos', count: pos.length - keep.length });
      pos = keep;
    }
  }

  if (!fits()) {
    const used = new Set(exercicios.map(ex => String(ex.grupo || '').toUpperCase()).filter(Boolean));
    const free = GROUP_LETTERS.filter(l => !used.has(l));
    const loose = exercicios
      .map((ex, i) => ({ ex, i }))
      .filter(({ ex, i }) => i >= MAIN_COUNT && !ex.grupo && sets(ex) > 0 && !isCardioItem(ex));
    for (let k = 0; k + 1 < loose.length && free.length; k += 2) {
      const [a, b] = [loose[k], loose[k + 1]];
      if (b.i !== a.i + 1) { k -= 1; continue; } // só junta vizinhos
      const letter = free.shift();
      a.ex.grupo = letter;
      b.ex.grupo = letter;
      changes.push({ type: 'superset', names: [a.ex.nome, b.ex.nome] });
    }
  }

  const accessories = () => exercicios.filter((_, i) => i >= MAIN_COUNT);
  const trimmed = new Map();
  function trim(ex, floor) {
    const min = Math.max(floor, locked(ex));
    if (sets(ex) <= min) return false;
    if (!trimmed.has(ex.nome)) trimmed.set(ex.nome, sets(ex));
    ex.series = String(sets(ex) - 1);
    return true;
  }

  // Uma série por vez, sempre do acessório com mais séries (o último em caso
  // de empate), para o corte sair espalhado e não zerar um exercício só.
  while (!fits()) {
    const candidates = accessories().filter(ex => sets(ex) > Math.max(MIN_ACCESSORY_SETS, locked(ex)));
    if (!candidates.length) break;
    const pick = candidates.reduce((a, b) => (sets(b) >= sets(a) ? b : a));
    trim(pick, MIN_ACCESSORY_SETS);
  }

  const removed = [];
  while (!fits()) {
    const idx = exercicios.map((ex, i) => ({ ex, i }))
      .filter(({ ex, i }) => i >= MAIN_COUNT && locked(ex) === 0)
      .map(({ i }) => i)
      .pop();
    if (idx === undefined) break;
    removed.unshift(exercicios[idx].nome);
    trimmed.delete(exercicios[idx].nome);
    exercicios.splice(idx, 1);
  }
  // Bi-set que perdeu o par volta a ser exercício avulso.
  exercicios.forEach(ex => {
    if (ex.grupo && exercicios.filter(o => o.grupo === ex.grupo).length < 2 && !day.exercicios.find(o => o.nome === ex.nome)?.grupo) {
      ex.grupo = null;
    }
  });

  while (!fits()) {
    const candidates = exercicios.slice(0, MAIN_COUNT).filter(ex => sets(ex) > Math.max(MIN_MAIN_SETS, locked(ex)));
    if (!candidates.length) break;
    trim(candidates.reduce((a, b) => (sets(b) >= sets(a) ? b : a)), MIN_MAIN_SETS);
  }
  if (!fits() && exercicios[0] && warmupCount(exercicios[0], 0) > 1) {
    exercicios[0].aquecimento = 1;
    changes.push({ type: 'warmup' });
  }

  trimmed.forEach((from, nome) => {
    const ex = exercicios.find(e => e.nome === nome);
    if (ex && sets(ex) < from) changes.push({ type: 'sets', nome, from, to: sets(ex) });
  });
  if (removed.length) changes.push({ type: 'removed', names: removed });
  // Bi-set desfeito porque um dos dois saiu não aparece como mudança.
  const result = current();
  const kept = changes.filter(c => c.type !== 'superset' || c.names.every(n => exercicios.some(e => e.nome === n && e.grupo)));
  return { day: result, minutes: estimateMinutes(result), changes: kept };
}

// Escolha do dia: { date, dia, minutes } — só vale para hoje.
export function readQuickChoice(dia) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.date === todayDate() && saved.dia === dia && QUICK_OPTIONS.includes(saved.minutes)) return saved.minutes;
  } catch { /* valor corrompido ou sem storage: treino completo */ }
  return null;
}

export function saveQuickChoice(dia, minutes) {
  try {
    if (minutes) localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayDate(), dia, minutes }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* sem storage: a escolha só não persiste */ }
}

// Dia que a tela usa: o enxuto quando há escolha para hoje, senão o do plano.
export function applyQuickChoice(day) {
  const minutes = day ? readQuickChoice(day.dia) : null;
  return minutes ? fitDayToTime(day, minutes).day : day;
}
