// Cadência (passos por minuto) pelo acelerômetro do celular. Cada pisada dá
// um pico na força total medida (|aceleração com a gravidade|): conta um
// passo quando a leitura passa da média recente por THRESHOLD e o passo
// anterior foi há pelo menos MIN_STEP_MS (≈ 240 passos/min no máximo).
// Precisa do celular junto ao corpo (bolso, braçadeira, mão) e da tela
// acesa: com a tela apagada o navegador para de mandar as leituras.
//
// Estado: { base, above, lastStepAt, lastT, steps, ms, recent }
//   steps/ms: passos contados e tempo (ms) coberto por leituras, para a média;
//   recent: horários dos passos dos últimos RECENT_MS, para a cadência do momento.

export const THRESHOLD = 1.2;
export const RELEASE = 0.3;
export const MIN_STEP_MS = 250;
// Intervalo maior que isso entre leituras: o sensor parou (tela apagou).
export const GAP_MS = 1000;
export const RECENT_MS = 15000;
// Média só vale com pelo menos 1 min de leituras.
export const MIN_MS = 60000;
const BASE_WEIGHT = 0.05;

export const emptySteps = () => ({ base: null, above: false, lastStepAt: null, lastT: null, steps: 0, ms: 0, recent: [] });

// t em ms, a em m/s² (módulo da aceleração com a gravidade).
export function addMotion(st, t, a) {
  if (!Number.isFinite(t) || !Number.isFinite(a)) return st;
  if (st.base == null) return { ...st, base: a, lastT: t };
  const dt = t - st.lastT;
  const ms = dt > 0 && dt <= GAP_MS ? st.ms + dt : st.ms;
  const base = st.base + BASE_WEIGHT * (a - st.base);
  const next = { ...st, base, lastT: t, ms };
  if (!st.above && a > st.base + THRESHOLD) {
    if (st.lastStepAt != null && t - st.lastStepAt < MIN_STEP_MS) return { ...next, above: true };
    const recent = [...st.recent.filter(x => t - x <= RECENT_MS), t];
    return { ...next, above: true, lastStepAt: t, steps: st.steps + 1, recent };
  }
  if (st.above && a < st.base + RELEASE) return { ...next, above: false };
  return next;
}

// Passos por minuto agora (últimos RECENT_MS); null com poucos passos.
export function currentCadence(st, now) {
  const recent = st.recent.filter(x => now - x <= RECENT_MS);
  if (recent.length < 8) return null;
  const span = recent.at(-1) - recent[0];
  return span > 0 ? Math.round(((recent.length - 1) / span) * 60000) : null;
}

// Média para salvar: null com pouca leitura ou valor fora do possível.
export function averageCadence(steps, ms) {
  if (!(ms >= MIN_MS) || !(steps > 0)) return null;
  const spm = Math.round((steps / ms) * 60000);
  return spm >= 60 && spm <= 260 ? spm : null;
}

export const motionSupported = () => typeof window !== 'undefined' && 'DeviceMotionEvent' in window;

// iPhone pede permissão para o acelerômetro, e só dentro de um toque. Chamar
// no toque de Começar; nos outros celulares não há pergunta.
export async function requestMotionPermission() {
  try {
    const DME = typeof window !== 'undefined' ? window.DeviceMotionEvent : null;
    if (DME && typeof DME.requestPermission === 'function') return (await DME.requestPermission()) === 'granted';
    return !!DME;
  } catch {
    return false;
  }
}
