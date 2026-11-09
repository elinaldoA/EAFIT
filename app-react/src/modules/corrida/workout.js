import { t } from '../../lib/i18n';
import { formatPace, decimal } from './runs';

// Treino guiado do EAFIT Run: intervalado em etapas (aquecimento, tiros,
// trote, desaquecimento) e ritmo alvo com aviso de voz.
//
// Treino: { warmupMin, reps, work: { unit, value }, rest: { unit, value },
//           cooldownMin, targetPace }
//   unit 'm' (metros, precisa de GPS) ou 's' (segundos); targetPace em s/km
//   vale para os tiros (null = sem alvo).
// Posição na corrida ao vivo: { index, startS, startM } — a etapa atual e o
// tempo de corrida (s) e a distância (m) em que ela começou.

export const LIMITS = {
  reps: [1, 30],
  m: [50, 10000],
  s: [10, 3600],
  warm: [0, 30],
  pace: [150, 900], // 2:30 a 15:00 por km
};

const clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));
// Campo ausente (null/undefined) vira NaN e cai no padrão; vazio digitado vale 0.
const int = v => (v == null ? NaN : Math.round(Number(String(v).replace(',', '.'))));

// "5:30" ou "5.30" → 330 s/km; null se vazio ou inválido.
export function parsePace(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})[:.,](\d{2})$/);
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59 || s < LIMITS.pace[0] || s > LIMITS.pace[1]) return null;
  return s;
}

const cleanPart = (p, fallback) => {
  const unit = p?.unit === 's' ? 's' : p?.unit === 'm' ? 'm' : fallback.unit;
  const value = int(p?.value);
  return { unit, value: Number.isFinite(value) && value > 0 ? clamp(value, LIMITS[unit]) : fallback.value };
};

// Treino válido a partir do que veio da tela ou do aparelho.
export function normalizeWorkout(w) {
  const reps = int(w?.reps);
  const warm = int(w?.warmupMin);
  const cool = int(w?.cooldownMin);
  const pace = Number.isFinite(w?.targetPace) ? w.targetPace : null;
  return {
    warmupMin: Number.isFinite(warm) ? clamp(warm, LIMITS.warm) : 10,
    reps: Number.isFinite(reps) && reps > 0 ? clamp(reps, LIMITS.reps) : 6,
    work: cleanPart(w?.work, { unit: 'm', value: 400 }),
    rest: cleanPart(w?.rest, { unit: 'm', value: 200 }),
    cooldownMin: Number.isFinite(cool) ? clamp(cool, LIMITS.warm) : 5,
    targetPace: pace !== null && pace >= LIMITS.pace[0] && pace <= LIMITS.pace[1] ? pace : null,
  };
}

export const needsGps = w => w.work.unit === 'm' || w.rest.unit === 'm';

// Sem GPS, etapa em metros vira tempo (≈ 2:30 por 400 m forte, trote mais lento).
export function withoutGps(w) {
  const toTime = (p, secPerKm) => (p.unit === 'm' ? { unit: 's', value: clamp(Math.round((p.value / 1000) * secPerKm / 5) * 5, LIMITS.s) } : p);
  return { ...w, work: toTime(w.work, 360), rest: toTime(w.rest, 480) };
}

// Lista de etapas: [{ type: 'warmup'|'work'|'rest'|'cooldown', unit, value, rep }].
// O último tiro não tem trote depois (vai direto ao desaquecimento).
export function buildSteps(w) {
  const steps = [];
  if (w.warmupMin > 0) steps.push({ type: 'warmup', unit: 's', value: w.warmupMin * 60, rep: null });
  for (let i = 1; i <= w.reps; i++) {
    steps.push({ type: 'work', ...w.work, rep: i });
    if (i < w.reps) steps.push({ type: 'rest', ...w.rest, rep: i });
  }
  if (w.cooldownMin > 0) steps.push({ type: 'cooldown', unit: 's', value: w.cooldownMin * 60, rep: null });
  return steps;
}

// Treino guiado das sessões do programa: o intervalado vira 400 m forte /
// 200 m trote e a corrida de ritmo vira aquecimento + bloco forte.
export function sessionWorkout(session) {
  if (!session) return null;
  if (session.custom) return normalizeWorkout(session.custom);
  if (session.type === 'intervalado' && session.reps) {
    return normalizeWorkout({ warmupMin: 10, reps: session.reps, work: { unit: 'm', value: 400 }, rest: { unit: 'm', value: 200 }, cooldownMin: 5 });
  }
  if (session.type === 'ritmo' && session.minutes) {
    return normalizeWorkout({ warmupMin: 10, reps: 1, work: { unit: 's', value: session.minutes * 60 }, rest: { unit: 's', value: 60 }, cooldownMin: 5 });
  }
  return null;
}

// Treinos prontos para escolher em um toque (só tiros e trote; aquecimento,
// desaquecimento e ritmo continuam os da tela).
export const PRESETS = [
  { id: '6x400', reps: 6, work: { unit: 'm', value: 400 }, rest: { unit: 'm', value: 200 } },
  { id: '8x400', reps: 8, work: { unit: 'm', value: 400 }, rest: { unit: 'm', value: 200 } },
  { id: '5x1000', reps: 5, work: { unit: 'm', value: 1000 }, rest: { unit: 'm', value: 400 } },
  { id: '3x2000', reps: 3, work: { unit: 'm', value: 2000 }, rest: { unit: 's', value: 120 } },
  { id: '10x1min', reps: 10, work: { unit: 's', value: 60 }, rest: { unit: 's', value: 60 } },
  { id: '20x30s', reps: 20, work: { unit: 's', value: 30 }, rest: { unit: 's', value: 30 } },
];

// "6x 400 m", "10x 1 min": o rótulo curto do botão.
export const presetLabel = p => `${p.reps}x ${formatAmount(p.work.unit, p.work.value)}`;

// O treino da tela é este preset?
export const isPreset = (p, w) => w.reps === p.reps
  && w.work.unit === p.work.unit && w.work.value === p.work.value
  && w.rest.unit === p.rest.unit && w.rest.value === p.rest.value;

export const startPosition = () => ({ index: 0, startS: 0, startM: 0 });

// Quanto falta na etapa atual: { done, left } (left em m ou s, conforme a etapa).
export function stepProgress(step, pos, elapsedS, meters) {
  if (!step) return { done: true, left: 0 };
  const used = step.unit === 'm' ? meters - pos.startM : elapsedS - pos.startS;
  const left = Math.max(0, step.value - used);
  return { done: used >= step.value, left };
}

// Avança enquanto a etapa atual terminou (devolve a mesma posição se não mudou).
// index === steps.length: treino concluído.
export function advanceWorkout(pos, steps, elapsedS, meters) {
  let cur = pos;
  while (cur.index < steps.length && stepProgress(steps[cur.index], cur, elapsedS, meters).done) {
    cur = { index: cur.index + 1, startS: elapsedS, startM: meters };
  }
  return cur;
}

// Pular a etapa atual (botão na tela).
export const skipStep = (pos, steps, elapsedS, meters) => (
  pos.index < steps.length ? { index: pos.index + 1, startS: elapsedS, startM: meters } : pos
);

export function formatAmount(unit, value) {
  if (unit === 'm') return value >= 1000 && value % 100 === 0 ? t('{v1} km', { v1: decimal(value / 1000) }) : t('{v1} m', { v1: Math.round(value) });
  const s = Math.round(value);
  if (s < 60) return t('{v1} s', { v1: s });
  return s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : t('{v1} min', { v1: s / 60 });
}

export const STEP_LABEL = {
  warmup: t('Aquecimento'),
  work: t('Forte'),
  rest: t('Trote'),
  cooldown: t('Desaquecimento'),
};

// "6x 400 m forte / 200 m trote · alvo 4:50/km"
export function describeWorkout(w) {
  const base = t('{v1}x {v2} forte / {v3} trote', { v1: w.reps, v2: formatAmount(w.work.unit, w.work.value), v3: formatAmount(w.rest.unit, w.rest.value) });
  return w.targetPace ? t('{v1} · alvo {v2}/km', { v1: base, v2: formatPace(w.targetPace) }) : base;
}

// "5:30" falado: "5 e 30" em português, "5 30" em inglês.
export const spoken = text => String(text).replace(/(\d+):(\d{2})/, (_, a, b) => t('{v1} e {v2}', { v1: a, v2: b }));

// O que a voz fala ao começar a etapa.
export function stepAnnouncement(step, reps) {
  if (!step) return t('Treino concluído. Ótimo trabalho!');
  const amount = spoken(formatAmount(step.unit, step.value));
  if (step.type === 'warmup') return t('Aquecimento: {v1}, bem leve.', { v1: amount });
  if (step.type === 'cooldown') return t('Desaquecimento: {v1}, bem leve.', { v1: amount });
  if (step.type === 'work') return t('Tiro {v1} de {v2}: {v3} forte!', { v1: step.rep, v2: reps, v3: amount });
  return t('Trote: {v1}. Respire.', { v1: amount });
}

// ---- Ritmo alvo -------------------------------------------------------------

// Ritmo (s/km) dos últimos ~WINDOW_M metros. samples: [{ s, m }] em ordem
// (tempo de corrida em s e distância em m). null com pouca distância.
export const WINDOW_M = 300;
export const MIN_WINDOW_M = 150;

export function rollingPace(samples) {
  if (!Array.isArray(samples) || samples.length < 2) return null;
  const last = samples.at(-1);
  let first = samples[0];
  for (let i = samples.length - 2; i >= 0; i--) {
    first = samples[i];
    if (last.m - samples[i].m >= WINDOW_M) break;
  }
  const dm = last.m - first.m;
  const ds = last.s - first.s;
  if (dm < MIN_WINDOW_M || !(ds > 0)) return null;
  return Math.round(ds / (dm / 1000));
}

// Guarda só o que a janela precisa (com folga).
export function pushSample(samples, s, m) {
  const list = [...samples, { s, m }];
  while (list.length > 2 && m - list[1].m >= WINDOW_M * 2) list.shift();
  return list;
}

export const PACE_TOLERANCE_S = 15;
export const ALERT_EVERY_S = 60;

// Aviso de ritmo: devolve { lastAt, message } (message null = nada a falar).
// Fala no máximo a cada ALERT_EVERY_S, e só fora da faixa de ±PACE_TOLERANCE_S.
export function paceAlert(lastAt, pace, target, elapsedS) {
  if (!target || pace == null) return { lastAt, message: null };
  if (lastAt != null && elapsedS - lastAt < ALERT_EVERY_S) return { lastAt, message: null };
  const diff = pace - target;
  if (Math.abs(diff) <= PACE_TOLERANCE_S) return { lastAt, message: null };
  const now = spoken(formatPace(pace));
  const goal = spoken(formatPace(target));
  return {
    lastAt: elapsedS,
    message: diff > 0
      ? t('Acelere um pouco: ritmo {v1}, alvo {v2}.', { v1: now, v2: goal })
      : t('Segure o ritmo: {v1}, alvo {v2}.', { v1: now, v2: goal }),
  };
}

// 'ok' | 'slow' | 'fast' para a cor do ritmo na tela.
export function paceStatus(pace, target) {
  if (!target || pace == null) return null;
  const diff = pace - target;
  return Math.abs(diff) <= PACE_TOLERANCE_S ? 'ok' : diff > 0 ? 'slow' : 'fast';
}
