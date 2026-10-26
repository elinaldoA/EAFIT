// Programa de corrida por objetivo de distância (5K, 10K, meia maratona): uma
// semana de plano por semana do programa, geradas por regra a partir do
// objetivo e do nível. Cada semana tem a mesma forma de um plano do app
// (7 dias, itens de cardio sem séries), então o registro de duração/distância
// (CardioRow) e o ciclo semanal funcionam como já funcionam. Nomes e focos são
// os que já têm tradução (exercícios da biblioteca e focos dos planos prontos).

export const RUN_GOALS = ['5k', '10k', 'meia'];

// Minutos do longão de cada semana, menos a última (semana da prova). Iniciante
// começa mais curto e usa o esquema corre/caminha até conseguir correr direto.
const PLANS = {
  '5k': { weeks: 8, km: 5, long: [25, 28, 30, 33, 35, 38, 40], beginnerLong: [24, 24, 26, 28, 30, 32, 35] },
  '10k': { weeks: 10, km: 10, long: [30, 34, 38, 42, 46, 50, 54, 58, 45], beginnerLong: [24, 24, 26, 28, 30, 32, 36, 40, 45] },
  'meia': { weeks: 12, km: 21.1, long: [40, 45, 50, 55, 60, 66, 72, 78, 84, 90, 60], beginnerLong: null },
};

// [minutos correndo, minutos caminhando] por semana; passando do fim da tabela,
// a corrida é contínua.
const RUN_WALK = [[1, 2], [2, 2], [3, 2], [5, 2], [8, 2], [12, 1], [20, 1]];

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const round5 = n => Math.round(n / 5) * 5;

// Iniciante não faz meia maratona do zero: cai no 10K (a tela também não oferece).
export function effectiveGoal(goal, nivel) {
  const g = RUN_GOALS.includes(goal) ? goal : '5k';
  return g === 'meia' && nivel === 'iniciante' ? '10k' : g;
}

export function goalWeeks(goal, nivel) {
  return PLANS[effectiveGoal(goal, nivel)].weeks;
}

const item = (nome, reps, tecnica, descanso = '-') => ({ nome, series: '-', reps, descanso, tecnica });
const rest = () => ({ foco: 'Descanso Total', exercicios: [item('Sem treino', '-', 'Recuperação ativa')], pos: [] });
const day = (foco, ...exercicios) => ({ foco, exercicios, pos: [] });

const runWalk = (minutes, [run, walk]) =>
  item('Caminhada e Corrida Alternadas', `${minutes}min · ${run}min corre / ${walk}min caminha`, 'Alterne sem pressa, respiração controlada');
const easy = minutes => item('Corrida Leve (Trote)', `${minutes}min · ritmo leve`, 'Ritmo em que dá pra conversar');
const longRun = minutes => item('Corrida Contínua (Longão)', `${minutes}min · ritmo leve`, 'Ritmo confortável, dá pra conversar');
const tempo = minutes => item('Corrida de Ritmo', `${minutes}min · ritmo forte`, 'Ritmo forte que dá pra sustentar');
const intervals = reps => item('Corrida Intervalada (HIIT)', `${reps}x400m forte / 200m trote`, 'Ritmo forte controlado', '90s');
const race = km => item('Corrida Contínua (Longão)', `${km}km · ritmo de prova`, 'Dia da prova: comece conservador e acelere no final');

function buildWeek({ w, weeks, nivel, plan }) {
  const beginner = nivel === 'iniciante';
  const raceWeek = w === weeks;
  const longMin = raceWeek ? 0 : (beginner ? plan.beginnerLong : plan.long)[w - 1];
  const easyMin = raceWeek ? 20 : Math.max(20, round5(longMin * 0.6));
  const shortMin = raceWeek ? 20 : Math.max(20, round5(longMin * 0.45));
  const rw = beginner && w <= RUN_WALK.length ? RUN_WALK[w - 1] : null;
  const easyItem = m => (rw ? runWalk(m, rw) : easy(m));

  const longDay = raceWeek
    ? day('Corrida Longa', race(plan.km))
    : day('Corrida Longa', rw ? runWalk(longMin, rw) : longRun(longMin));
  const easyDay = m => day('Cardio Leve / Recuperação', easyItem(m));
  const stepUp = Math.min(6, Math.floor(w / 2));
  const intervalDay = raceWeek ? easyDay(20) : day('Corrida Intervalada', intervals(Math.min(12, 4 + stepUp)));
  const tempoDay = raceWeek ? easyDay(20) : day('Corrida Intervalada', tempo(Math.min(35, 15 + 2 * stepUp)));
  const cross = day('Cross-training', item('Bicicleta ou Natação', '40min', 'Intensidade moderada'));

  let week;
  if (nivel === 'avancado') {
    week = [easyDay(easyMin), intervalDay, cross, tempoDay, easyDay(shortMin), longDay, rest()];
  } else if (nivel === 'intermediario') {
    // semanas ímpares intervalado, pares ritmo
    week = [easyDay(easyMin), rest(), w % 2 ? intervalDay : tempoDay, rest(), easyDay(shortMin), longDay, rest()];
  } else {
    week = [easyDay(easyMin), rest(), easyDay(easyMin), rest(), rest(), longDay, rest()];
  }
  return week.map((d, i) => ({ dia: DIAS[i], ...d }));
}

const LABEL = { '5k': '5K', '10k': '10K', 'meia': 'Meia maratona' };

// { goal, nivel, weeks: [{ week, name, days }] } — `goal` já corrigido pelo nível.
export function buildRunningProgram({ goal, nivel }) {
  const lvl = ['iniciante', 'intermediario', 'avancado'].includes(nivel) ? nivel : 'intermediario';
  const g = effectiveGoal(goal, lvl);
  const plan = PLANS[g];
  return {
    goal: g,
    nivel: lvl,
    weeks: Array.from({ length: plan.weeks }, (_, i) => ({
      week: i + 1,
      name: `Corrida ${LABEL[g]} · semana ${i + 1} de ${plan.weeks}`,
      days: buildWeek({ w: i + 1, weeks: plan.weeks, nivel: lvl, plan }),
    })),
  };
}

// Semana de manutenção, usada quando o programa termina e o app gera o ciclo
// seguinte sozinho: rodagens leves e um longão curto, sem progressão.
export function buildRunningMaintenance({ nivel } = {}) {
  const beginner = nivel === 'iniciante';
  const long = beginner ? 30 : 45;
  const e = beginner ? 25 : 30;
  const week = [day('Cardio Leve / Recuperação', easy(e)), rest(), day('Cardio Leve / Recuperação', easy(e)), rest(), rest(), day('Corrida Longa', longRun(long)), rest()];
  return week.map((d, i) => ({ dia: DIAS[i], ...d }));
}
