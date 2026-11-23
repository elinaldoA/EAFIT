import { isCardioItem } from './cardio';
import { isTimedItem } from './timedSets';

// Itens de cardio não têm séries no plano, mas contam como 1 registro.
export function setCountOf(ex) {
  return isCardioItem(ex) ? 1 : (parseInt(ex.series, 10) || 0);
}

// Volume do dia (carga × reps das séries feitas), a mesma conta do Histórico e
// da Evolução. Antes era a soma das cargas: 3 séries de 60 kg davam "180 kg".
export function calcDayVolume(day) {
  let total = 0;
  [...day.exercicios, ...day.pos].forEach(ex => {
    const count = parseInt(ex.series, 10);
    if (!count) return;
    for (let n = 1; n <= count; n++) {
      const done = localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_done`) === 'true';
      const carga = parseFloat(localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_carga`));
      const reps = parseFloat(localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_reps`));
      if (done && !isNaN(carga) && !isNaN(reps)) total += carga * reps;
    }
  });
  return Math.round(total);
}

export function gatherExerciseDetails(day) {
  return [...day.exercicios, ...day.pos]
    .map(ex => {
      const count = setCountOf(ex);
      const cardio = isCardioItem(ex);
      const timed = isTimedItem(ex);
      const sets = Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        return {
          n,
          done: localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_done`) === 'true',
          carga: localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_carga`) || null,
          reps: localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_reps`) || null,
          ...(timed && { duracaoS: localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_duracao_s`) || null }),
          ...(cardio && {
            duracao: localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_duracao`) || null,
            distancia: localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_distancia`) || null,
          }),
        };
      });
      return { nome: ex.nome, cardio, timed, sets };
    })
    .filter(ex => ex.sets.length > 0);
}

export function countSets(exercises) {
  let done = 0, total = 0;
  exercises.forEach(ex => ex.sets.forEach(s => { total++; if (s.done) done++; }));
  return { done, total };
}

export function allSetsDone(ex, setCount, dia) {
  for (let n = 1; n <= setCount; n++) {
    if (localStorage.getItem(`set_${dia}_${ex.nome}_${n}_done`) !== 'true') return false;
  }
  return true;
}

// Apaga do aparelho tudo o que é do treino de um dia (séries, cronômetro, notas,
// nota do treino). Chamado quando o servidor é a fonte da verdade: sem isso, o
// que ficou da semana passada reaparecia como feito na semana nova.
export function clearDayLocal(day, { keepTimer = false } = {}) {
  const prefixes = [`set_${day.dia}_`];
  const own = [...(keepTimer ? [] : [`treino_${day.dia}_timer`]), `treino_${day.dia}_notes`, `treino_${day.dia}_rating`];
  Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).forEach(k => {
    if (k && (own.includes(k) || prefixes.some(p => k.startsWith(p)))) localStorage.removeItem(k);
  });
}
