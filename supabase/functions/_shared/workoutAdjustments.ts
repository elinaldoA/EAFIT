// PORT literal de app-react/src/data/workoutAdjustments.js — não há pacote
// compartilhado entre app-react (Vite/browser) e as Edge Functions (Deno)
// neste repo, então a duplicação é deliberada (mesmo espírito de
// _shared/webpush.ts). Usado por admin-generate-plan/index.ts. Se
// workoutAdjustments.js mudar — sobretudo LEVEL_EXERCISE_SUBS, SERIES_DELTA,
// DESCANSO_DELTA_S, computeImcBracket ou applyImcAdjustment — espelhar aqui
// também. workoutAdjustments.test.ts cobre este arquivo isoladamente; os
// testes de app-react/src/data/workoutTemplates.test.js cobrem só o lado
// app-react — não há verificação automática de que os dois lados batem.
export type Exercise = { nome: string; series: string; reps: string; descanso: string; tecnica: string };
export type Day = { dia: string; foco: string; exercicios: Exercise[]; pos: Exercise[] };

export function computeImcBracket(peso: number, altura: number): string {
  const p = parseFloat(String(peso));
  const a = parseFloat(String(altura));
  if (!(p > 0) || !(a > 0)) return 'normal';
  const imc = p / ((a / 100) ** 2);
  if (imc < 18.5) return 'abaixo';
  if (imc < 25) return 'normal';
  if (imc < 30) return 'sobrepeso';
  return 'obesidade';
}

function isRestOrCardioDay(day: Day) {
  return day.foco.includes('Cardio Leve') || day.foco.includes('Descanso');
}

function cloneDay(day: Day): Day {
  return { dia: day.dia, foco: day.foco, exercicios: day.exercicios.map(e => ({ ...e })), pos: day.pos.map(p => ({ ...p })) };
}

function trimCardio(day: Day): Day {
  return { ...day, pos: day.pos.filter(p => !p.nome.startsWith('🏃')) };
}

function ensureCardio(day: Day): Day {
  if (day.pos.some(p => p.nome.startsWith('🏃'))) return day;
  return { ...day, pos: [...day.pos, { nome: '🏃 Cardio — Caminhada ou Bicicleta', series: '-', reps: '20min · Moderado', descanso: '-', tecnica: '' }] };
}

function reduceVolume(day: Day): Day {
  return {
    ...day,
    exercicios: day.exercicios.map(ex => {
      const n = parseInt(ex.series, 10);
      if (!Number.isFinite(n)) return ex;
      return { ...ex, series: String(Math.max(2, n - 1)) };
    }),
  };
}

function lightCardioDay(dia: string): Day {
  return {
    dia,
    foco: 'Cardio Leve / Recuperação',
    exercicios: [{ nome: 'Caminhada Rápida ou Bicicleta', series: '-', reps: '30-40min', descanso: '-', tecnica: '5-6km/h ou 130bpm (baixo impacto)' }],
    pos: [],
  };
}

export function applyImcAdjustment(templateDays: Day[], bracket: string): Day[] {
  const days = templateDays.map(cloneDay);

  if (bracket === 'abaixo') {
    return days.map(d => (isRestOrCardioDay(d) ? d : trimCardio(d)));
  }
  if (bracket === 'sobrepeso') {
    return days.map(d => (isRestOrCardioDay(d) ? d : ensureCardio(d)));
  }
  if (bracket === 'obesidade') {
    const trainingIdx = days.map((d, i) => (isRestOrCardioDay(d) ? -1 : i)).filter(i => i >= 0);
    const toDowngrade = new Set(trainingIdx.slice(-2));
    return days.map((d, i) => {
      if (toDowngrade.has(i)) return lightCardioDay(d.dia);
      if (trainingIdx.includes(i)) return reduceVolume(d);
      return d;
    });
  }
  return days;
}

export const LEVEL_EXERCISE_SUBS: Record<string, Record<string, { nome: string; tecnica: string }>> = {
  'Supino Reto com Barra': {
    iniciante: { nome: 'Supino Reto na Máquina', tecnica: 'Trajetória guiada, foco na execução' },
    avancado: { nome: 'Supino Reto com Barra (pausa no peito)', tecnica: 'Pausa 1s no peito, sem quicar' },
  },
  'Supino Inclinado com Halteres': {
    iniciante: { nome: 'Supino Inclinado na Máquina', tecnica: 'Trajetória guiada' },
    avancado: { nome: 'Supino Inclinado com Halteres (unilateral)', tecnica: 'Um braço por vez, core travado' },
  },
  'Desenvolvimento com Barra': {
    iniciante: { nome: 'Desenvolvimento na Máquina', tecnica: 'Trajetória guiada' },
    avancado: { nome: 'Desenvolvimento Militar em Pé', tecnica: 'Sem apoio lombar, core ativo' },
  },
  'Levantamento Terra': {
    iniciante: { nome: 'Levantamento Terra Romeno (barra guiada)', tecnica: 'Amplitude reduzida, foco na técnica' },
    avancado: { nome: 'Levantamento Terra (déficit)', tecnica: 'Pés sobre anteparo, ROM ampliado' },
  },
  'Agachamento Livre': {
    iniciante: { nome: 'Agachamento no Smith', tecnica: 'Trajetória guiada' },
    avancado: { nome: 'Agachamento Livre (pausa no fundo)', tecnica: 'Pausa 2s no fundo' },
  },
  'Remada Curvada com Barra': {
    iniciante: { nome: 'Remada Curvada na Máquina', tecnica: 'Trajetória guiada' },
    avancado: { nome: 'Remada Curvada com Barra (pegada supinada)', tecnica: 'Pegada supinada, foco lombar' },
  },
  'Puxada Aberta Frente': {
    iniciante: { nome: 'Puxada Aberta Assistida', tecnica: 'Contrapeso reduz o peso corporal' },
    avancado: { nome: 'Barra Fixa (peso corporal)', tecnica: 'Amplitude completa, sem impulso' },
  },
  'Leg Press 45°': {
    avancado: { nome: 'Leg Press 45° (unilateral)', tecnica: 'Uma perna por vez' },
  },
  'Afundo Búlgaro': {
    iniciante: { nome: 'Afundo Estático (sem banco)', tecnica: 'Passada fixa, mais estável' },
    avancado: { nome: 'Afundo Búlgaro (com salto)', tecnica: 'Excêntrica controlada + salto' },
  },
  'Romeno com Barra': {
    iniciante: { nome: 'Romeno com Halteres', tecnica: 'Carga menor, mais controle' },
    avancado: { nome: 'Romeno Unilateral com Halter', tecnica: 'Equilíbrio + core' },
  },
};

export const SERIES_DELTA: Record<string, number> = { iniciante: -1, intermediario: 0, avancado: 1 };
export const DESCANSO_DELTA_S: Record<string, number> = { iniciante: 15, intermediario: 0, avancado: -15 };

function parseDescansoSeconds(str: string): number | null {
  const min = str.match(/(\d+(?:\.\d+)?)\s*min/);
  if (min) return Math.round(parseFloat(min[1]) * 60);
  const sec = str.match(/(\d+)\s*s/);
  if (sec) return parseInt(sec[1], 10);
  return null;
}

function formatDescansoSeconds(s: number): string {
  if (s >= 120 && s % 60 === 0) return `${s / 60}min`;
  return `${s}s`;
}

function adjustSeries(series: string, delta: number): string {
  const n = parseInt(series, 10);
  if (!Number.isFinite(n) || !delta) return series;
  return String(Math.min(6, Math.max(2, n + delta)));
}

function adjustDescanso(descanso: string, deltaSeconds: number): string {
  const s = parseDescansoSeconds(descanso);
  if (s === null || !deltaSeconds) return descanso;
  return formatDescansoSeconds(Math.max(30, s + deltaSeconds));
}

function applyLevelToExercise(ex: Exercise, nivel: string, allowSub: boolean): Exercise {
  const sub = allowSub ? LEVEL_EXERCISE_SUBS[ex.nome]?.[nivel] : null;
  const seriesDelta = SERIES_DELTA[nivel] ?? 0;
  const descansoDelta = DESCANSO_DELTA_S[nivel] ?? 0;
  return {
    ...ex,
    nome: sub?.nome ?? ex.nome,
    tecnica: sub?.tecnica ?? ex.tecnica,
    series: ex.series === '-' ? ex.series : adjustSeries(ex.series, seriesDelta),
    descanso: ex.descanso === '-' ? ex.descanso : adjustDescanso(ex.descanso, descansoDelta),
  };
}

export function applyLevelAdjustment(templateDays: Day[], nivel?: string): Day[] {
  if (!nivel || nivel === 'intermediario') return templateDays.map(cloneDay);
  return templateDays.map(day => {
    if (isRestOrCardioDay(day)) return cloneDay(day);
    return {
      dia: day.dia,
      foco: day.foco,
      exercicios: day.exercicios.map(ex => applyLevelToExercise(ex, nivel, true)),
      pos: day.pos.map(ex => (ex.nome.startsWith('🏃') ? { ...ex } : applyLevelToExercise(ex, nivel, false))),
    };
  });
}
