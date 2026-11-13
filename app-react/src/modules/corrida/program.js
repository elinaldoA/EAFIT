import { t, lang } from '../../lib/i18n';
import { parseLocalDate, toDateStr } from '../../lib/utils';

// Programa do EAFIT Run: semanas de corrida por objetivo (5K, 10K, meia
// maratona) e nível, geradas por regra. A escolha fica na conta
// (user_metadata.runGoal, runNivel e runStart — a segunda-feira em que o
// programa começou); a semana de hoje sai da data, sem nada salvo por semana.
// Sem objetivo (corrida livre) ou depois do fim, vale a semana de manutenção.
//
// Cada dia é uma sessão: { type, minutes?, km?, reps?, run?, walk? }
// - type: leve | longao | intervalado | ritmo | corre_caminha | prova | cross | descanso

export const RUN_GOALS = ['5k', '10k', 'meia', 'livre'];
export const RUN_LEVELS = ['iniciante', 'intermediario', 'avancado'];

export const GOAL_LABEL = {
  '5k': t('5K'),
  '10k': t('10K'),
  meia: t('Meia maratona'),
  livre: t('Corrida livre'),
};

// Minutos do longão de cada semana, menos a última (semana da prova). Iniciante
// começa mais curto e usa o corre/caminha até conseguir correr direto.
const PLANS = {
  '5k': { weeks: 8, km: 5, long: [25, 28, 30, 33, 35, 38, 40], beginnerLong: [24, 24, 26, 28, 30, 32, 35] },
  '10k': { weeks: 10, km: 10, long: [30, 34, 38, 42, 46, 50, 54, 58, 45], beginnerLong: [24, 24, 26, 28, 30, 32, 36, 40, 45] },
  meia: { weeks: 12, km: 21.1, long: [40, 45, 50, 55, 60, 66, 72, 78, 84, 90, 60], beginnerLong: null },
};

// [minutos correndo, minutos caminhando] por semana do iniciante; passando do
// fim da tabela, a corrida é contínua.
const RUN_WALK = [[1, 2], [2, 2], [3, 2], [5, 2], [8, 2], [12, 1], [20, 1]];


const round5 = n => Math.round(n / 5) * 5;

export const normalizeLevel = nivel => (RUN_LEVELS.includes(nivel) ? nivel : 'intermediario');

// Iniciante não faz meia maratona do zero: cai no 10K (a tela também não oferece).
export function effectiveGoal(goal, nivel) {
  const g = RUN_GOALS.includes(goal) ? goal : 'livre';
  return g === 'meia' && normalizeLevel(nivel) === 'iniciante' ? '10k' : g;
}

export const goalWeeks = (goal, nivel) => PLANS[effectiveGoal(goal, nivel)]?.weeks || 0;

const rest = () => ({ type: 'descanso' });

function buildWeek(w, weeks, nivel, plan) {
  const beginner = nivel === 'iniciante';
  const raceWeek = w === weeks;
  const longMin = raceWeek ? 0 : (beginner ? plan.beginnerLong : plan.long)[w - 1];
  const easyMin = raceWeek ? 20 : Math.max(20, round5(longMin * 0.6));
  const shortMin = raceWeek ? 20 : Math.max(20, round5(longMin * 0.45));
  const rw = beginner && w <= RUN_WALK.length ? RUN_WALK[w - 1] : null;

  const easy = minutes => (rw ? { type: 'corre_caminha', minutes, run: rw[0], walk: rw[1] } : { type: 'leve', minutes });
  const long = raceWeek ? { type: 'prova', km: plan.km }
    : rw ? { type: 'corre_caminha', minutes: longMin, run: rw[0], walk: rw[1] }
      : { type: 'longao', minutes: longMin };
  const stepUp = Math.min(6, Math.floor(w / 2));
  const interval = raceWeek ? easy(20) : { type: 'intervalado', reps: Math.min(12, 4 + stepUp) };
  const tempo = raceWeek ? easy(20) : { type: 'ritmo', minutes: Math.min(35, 15 + 2 * stepUp) };

  if (nivel === 'avancado') return [easy(easyMin), interval, { type: 'cross', minutes: 40 }, tempo, easy(shortMin), long, rest()];
  // Intermediário: semanas ímpares intervalado, pares ritmo.
  if (nivel === 'intermediario') return [easy(easyMin), rest(), w % 2 ? interval : tempo, rest(), easy(shortMin), long, rest()];
  return [easy(easyMin), rest(), easy(easyMin), rest(), rest(), long, rest()];
}

// Semana sem progressão: corrida livre ou depois que o programa termina.
export function maintenanceWeek(nivel) {
  const lvl = normalizeLevel(nivel);
  const beginner = lvl === 'iniciante';
  const e = beginner ? 25 : 30;
  return [{ type: 'leve', minutes: e }, rest(), { type: 'leve', minutes: e }, rest(), rest(), { type: 'longao', minutes: beginner ? 30 : 45 }, rest()];
}

// { goal, nivel, weeks: [{ week, days: [7 sessões, segunda a domingo] }] }.
// start + raceDate (opcionais): se a prova marcada cai na última semana do programa,
// o "Dia da prova" vai para o dia dela (em vez de sempre sábado) e o dia que ele
// ocupava troca de lugar com ele.
export function buildRunProgram({ goal, nivel, start = null, raceDate = null }) {
  const lvl = normalizeLevel(nivel);
  const g = effectiveGoal(goal, lvl);
  const plan = PLANS[g];
  if (!plan) return { goal: g, nivel: lvl, weeks: [] };
  const weeks = Array.from({ length: plan.weeks }, (_, i) => ({
    week: i + 1,
    days: buildWeek(i + 1, plan.weeks, lvl, plan),
  }));
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(raceDate || '')) {
    const lastMonday = parseLocalDate(mondayOf(start));
    lastMonday.setDate(lastMonday.getDate() + (plan.weeks - 1) * 7);
    if (mondayOf(raceDate) === toDateStr(lastMonday)) {
      const days = [...weeks[plan.weeks - 1].days];
      const from = days.findIndex(d => d.type === 'prova');
      const to = (parseLocalDate(raceDate).getDay() + 6) % 7;
      if (from >= 0 && from !== to) [days[from], days[to]] = [days[to], days[from]];
      weeks[plan.weeks - 1] = { week: plan.weeks, days };
    }
  }
  return { goal: g, nivel: lvl, weeks };
}

// Segunda-feira da semana de `dateStr` (YYYY-MM-DD).
export function mondayOf(dateStr) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateStr(d);
}

const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((parseLocalDate(b) - parseLocalDate(a)) / DAY_MS);

// Programa salvo na conta, ou null se a pessoa ainda não escolheu.
export function programFromMetadata(md) {
  if (!md || !RUN_GOALS.includes(md.runGoal)) return null;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(md.runStart || '') ? mondayOf(md.runStart) : null;
  const raceDate = /^\d{4}-\d{2}-\d{2}$/.test(md.runRace?.date || '') ? md.runRace.date : null;
  return { goal: effectiveGoal(md.runGoal, md.runNivel), nivel: normalizeLevel(md.runNivel), start, raceDate };
}

// Onde a pessoa está hoje: { week, weeks, dayIndex, days, finished, maintenance }.
// week/weeks = 0 na corrida livre (e depois do fim do programa).
export function programToday(program, today) {
  const dayIndex = (parseLocalDate(today).getDay() + 6) % 7;
  const built = buildRunProgram(program);
  const weeks = built.weeks.length;
  const elapsed = program.start ? daysBetween(program.start, today) : -1;
  const week = elapsed >= 0 ? Math.floor(elapsed / 7) + 1 : 0;
  if (!weeks || week < 1 || week > weeks) {
    return { week: 0, weeks, dayIndex, days: maintenanceWeek(program.nivel), finished: weeks > 0 && week > weeks, maintenance: true };
  }
  return { week, weeks, dayIndex, days: built.weeks[week - 1].days, finished: false, maintenance: false };
}

export const SESSION_TITLE = {
  leve: t('Corrida leve'),
  longao: t('Longão'),
  intervalado: t('Intervalado'),
  ritmo: t('Corrida de ritmo'),
  corre_caminha: t('Corre e caminha'),
  prova: t('Dia da prova'),
  cross: t('Treino cruzado'),
  descanso: t('Descanso'),
  livre: t('Corrida livre'),
};

export const sessionTitle = s => SESSION_TITLE[s?.type] || SESSION_TITLE.livre;

// Texto do alvo: "30 min · ritmo leve", "6x 400 m forte / 200 m trote"…
export function describeSession(s) {
  switch (s?.type) {
    case 'leve': return t('{v1} min · ritmo de conversa', { v1: s.minutes });
    case 'longao': return t('{v1} min · ritmo confortável', { v1: s.minutes });
    case 'intervalado': return t('{v1}x 400 m forte / 200 m trote', { v1: s.reps });
    case 'ritmo': return t('{v1} min · forte, mas sustentável', { v1: s.minutes });
    case 'corre_caminha': return t('{v1} min · {v2} min corre / {v3} min caminha', { v1: s.minutes, v2: s.run, v3: s.walk });
    case 'prova': return t('{v1} km · comece conservador e acelere no fim', { v1: lang === 'en' ? String(s.km) : String(s.km).replace('.', ',') });
    case 'cross': return t('{v1} min de bicicleta ou natação', { v1: s.minutes });
    case 'descanso': return t('Recuperação: o corpo fica mais forte no descanso');
    default: return t('Sem alvo: corra no seu ritmo');
  }
}

export const isRunSession = s => !!s && !['descanso', 'cross'].includes(s.type);
