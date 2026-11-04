// Trilha original dos Reels, sintetizada em código (batida, baixo e acordes em
// lá menor, 112 bpm): não usa nenhuma música de terceiros, então não tem
// direito autoral a respeitar. Devolve PCM estéreo (Float32) de 44,1 kHz, igual
// no navegador e no Node; o script ainda a embrulha em WAV para o ffmpeg.
const SR = 44100;
const BPM = 112;
const BEAT = 60 / BPM;

// Ruído repetível (a mesma trilha em toda execução).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x80000000 - 1;
  };
}

export const SAMPLE_RATE = SR;

// Estéreo normalizado (pico 0,7) com entrada e saída suaves.
export function synthTrack(seconds) {
  const n = Math.floor(seconds * SR);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const noise = rng(7);
  const add = (i, v, pan = 0) => {
    if (i < 0 || i >= n) return;
    left[i] += v * (1 - Math.max(0, pan));
    right[i] += v * (1 + Math.min(0, pan));
  };

  // Bumbo em toda batida, palma nas batidas 2 e 4, chimbal nos contratempos.
  for (let b = 0; b * BEAT < seconds; b += 1) {
    const t0 = b * BEAT;
    let phase = 0;
    for (let k = 0; k < 0.35 * SR; k += 1) {
      const t = k / SR;
      phase += (2 * Math.PI * (48 + 110 * Math.exp(-t * 28))) / SR;
      add(Math.floor(t0 * SR) + k, 0.8 * Math.sin(phase) * Math.exp(-t * 11));
    }
    if (b % 2 === 1) {
      for (let k = 0; k < 0.16 * SR; k += 1) {
        const t = k / SR;
        add(Math.floor(t0 * SR) + k, 0.22 * noise() * Math.exp(-t * 26), 0.1);
      }
    }
    const th = t0 + BEAT / 2;
    let prev = 0;
    for (let k = 0; k < 0.05 * SR; k += 1) {
      const t = k / SR;
      const x = noise();
      add(Math.floor(th * SR) + k, 0.1 * (x - prev) * Math.exp(-t * 70), -0.2);
      prev = x;
    }
  }

  // Baixo em colcheias (lá, lá, dó, lá, mi, lá, dó, ré).
  const bass = [55, 55, 65.41, 55, 82.41, 55, 65.41, 73.42];
  for (let e = 0; e * (BEAT / 2) < seconds; e += 1) {
    const f = bass[e % bass.length];
    const t0 = e * (BEAT / 2);
    for (let k = 0; k < 0.28 * SR; k += 1) {
      const t = k / SR;
      const env = Math.exp(-t * 7) * Math.min(1, t * 400);
      add(Math.floor(t0 * SR) + k, 0.26 * env * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)));
    }
  }

  // Acordes (lá menor, fá, dó, sol) em stabs curtos nos contratempos.
  const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  for (let b = 0; b * BEAT < seconds; b += 1) {
    const chord = chords[Math.floor(b / 4) % chords.length];
    const t0 = b * BEAT + BEAT / 2;
    for (let k = 0; k < 0.3 * SR; k += 1) {
      const t = k / SR;
      const env = Math.exp(-t * 9) * Math.min(1, t * 300);
      let v = 0;
      for (const f of chord) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(6 * Math.PI * f * t);
      add(Math.floor(t0 * SR) + k, 0.05 * env * v, 0.3);
    }
  }

  // Subidas de ruído antes das trocas de cena (3,4 s e 9,6 s).
  for (const at of [3.4, 9.6]) {
    const len = 0.5;
    let prev = 0;
    for (let k = 0; k < len * SR; k += 1) {
      const t = k / SR;
      const x = noise();
      add(Math.floor((at - len) * SR) + k, 0.16 * (x - prev) * (t / len) ** 2);
      prev = x;
    }
  }

  // Entrada e saída suaves, ganho para o pico ficar em 0,7.
  let peak = 0;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const gain = peak > 0 ? 0.7 / peak : 1;
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.15) * Math.min(1, (seconds - t) / 0.9);
    left[i] *= gain * fade;
    right[i] *= gain * fade;
  }
  return { left, right, sampleRate: SR };
}
