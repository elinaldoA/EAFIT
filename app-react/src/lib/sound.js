// Ganho do alarme de descanso (0–1). Era 0.16; acima de ~0.6 a onda quadrada distorce.
const REST_ALARM_GAIN = 0.55;

function tone(ctx, freq, startTime, duration, gainValue = 0.15, type = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(gainValue, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  // Em alguns navegadores móveis o contexto nasce suspenso e o alarme sairia mudo.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Alarme de despertador: rajadas de bips curtos em onda quadrada (mais "áspera"
// que uma senoide), três rodadas de 3 bips como um despertador digital tocando.
// Volume alto de propósito: o celular costuma estar na bancada ou no bolso.
export function playRestDoneSound() {
  try {
    const ctx = getAudioCtx();
    const beepDur = 0.13;
    const gap = 0.09;
    const roundGap = 0.22;
    const beepsPerRound = 3;
    const rounds = 3;
    let t = ctx.currentTime;
    for (let r = 0; r < rounds; r++) {
      for (let b = 0; b < beepsPerRound; b++) {
        tone(ctx, 1046.5, t, beepDur, REST_ALARM_GAIN, 'square');
        t += beepDur + gap;
      }
      t += roundGap;
    }
  } catch { /* som indisponível */ }
  if (navigator.vibrate) navigator.vibrate([130, 90, 130, 90, 130, 220, 130, 90, 130, 90, 130]);
}

export function playWorkoutFinishedSound() {
  try {
    const ctx = getAudioCtx();
    // acorde ascendente de 3 notas para marcar a conclusão do treino
    tone(ctx, 523.25, ctx.currentTime, 0.18);
    tone(ctx, 659.25, ctx.currentTime + 0.15, 0.18);
    tone(ctx, 783.99, ctx.currentTime + 0.3, 0.5, 0.18);
  } catch { /* som indisponível */ }
  if (navigator.vibrate) navigator.vibrate([120, 60, 120, 60, 250]);
}
