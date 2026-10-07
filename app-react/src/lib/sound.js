// Ganho do alarme de descanso (0–1). Era 0.16. Perto de 1 a onda quadrada já usa a
// faixa toda; o resto do volume é o volume de mídia do aparelho.
const REST_ALARM_GAIN = 0.9;
// Tons agudos (≈2–2,6 kHz): os alto-falantes de celular reproduzem mal sons graves
// e o ouvido é mais sensível nessa faixa, então soam bem mais altos que 1 kHz.
const REST_ALARM_FREQS = [2093, 2637];

// Bip de alarme: o volume fica constante durante o bip (a tone() decai
// exponencialmente e perde força), com subida e descida curtas para não estalar.
function alarmBeep(ctx, freq, startTime, duration, gainValue) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.005);
  gain.gain.setValueAtTime(gainValue, startTime + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

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
// que uma senoide), quatro rodadas de 3 bips alternando dois tons agudos, como um
// despertador digital tocando.
// Volume alto de propósito: o celular costuma estar na bancada ou no bolso.
export function playRestDoneSound() {
  try {
    const ctx = getAudioCtx();
    const beepDur = 0.16;
    const gap = 0.08;
    const roundGap = 0.25;
    const beepsPerRound = 3;
    const rounds = 4;
    let t = ctx.currentTime;
    for (let r = 0; r < rounds; r++) {
      for (let b = 0; b < beepsPerRound; b++) {
        alarmBeep(ctx, REST_ALARM_FREQS[b % 2], t, beepDur, REST_ALARM_GAIN);
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
