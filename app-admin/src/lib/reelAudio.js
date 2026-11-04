// Trilhas originais dos Reels e Stories, sintetizadas em código (batida, baixo e
// acordes): não usam nenhuma música de terceiros, então não há direito autoral a
// respeitar. Devolvem PCM estéreo (Float32) de 44,1 kHz, igual no navegador e no
// Node; o script ainda o embrulha em WAV para o ffmpeg.
//
// Estilos: `energy` (Reels, 112 bpm, lá menor), `bright` (stories de café e
// almoço, 100 bpm, dó maior) e `calm` (stories de jantar e ceia, 80 bpm, acordes
// longos e batida suave).
const SR = 44100;

// Ruído repetível (a mesma trilha em toda execução).
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x80000000 - 1;
  };
}

export const SAMPLE_RATE = SR;

// bass: 0 = pausa. chordEvery/chordOffset em batidas; chordLen e chordDecay em segundos.
export const AUDIO_STYLES = {
  energy: {
    bpm: 112, kick: 0.8, snare: 0.22, hat: 0.1,
    bass: [55, 55, 65.41, 55, 82.41, 55, 65.41, 73.42], bassAmp: 0.26,
    chords: [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]],
    chordEvery: 1, chordOffset: 0.5, chordLen: 0.3, chordDecay: 9, chordAmp: 0.05,
  },
  bright: {
    bpm: 100, kick: 0.6, snare: 0.15, hat: 0.08,
    bass: [65.41, 65.41, 98, 65.41, 87.31, 87.31, 98, 73.42], bassAmp: 0.24,
    chords: [[261.63, 329.63, 392], [196, 246.94, 293.66], [220, 261.63, 329.63], [174.61, 220, 261.63]],
    chordEvery: 1, chordOffset: 0.5, chordLen: 0.35, chordDecay: 7, chordAmp: 0.06,
  },
  calm: {
    bpm: 80, kick: 0.35, snare: 0, hat: 0.04,
    bass: [55, 0, 55, 0, 65.41, 0, 49, 0], bassAmp: 0.2,
    chords: [[220, 261.63, 329.63, 392], [174.61, 220, 261.63, 329.63], [261.63, 329.63, 392, 493.88], [196, 246.94, 293.66, 329.63]],
    chordEvery: 2, chordOffset: 0, chordLen: 1.6, chordDecay: 2.2, chordAmp: 0.045,
  },
};

// Estéreo normalizado (pico 0,7) com entrada e saída suaves. `sweeps` são os
// instantes (s) das trocas de cena, onde entra uma subida de ruído.
export function synthTrack(seconds, { style = 'energy', sweeps = [3.4, 9.6] } = {}) {
  const st = AUDIO_STYLES[style] || AUDIO_STYLES.energy;
  const BEAT = 60 / st.bpm;
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
      add(Math.floor(t0 * SR) + k, st.kick * Math.sin(phase) * Math.exp(-t * 11));
    }
    if (st.snare > 0 && b % 2 === 1) {
      for (let k = 0; k < 0.16 * SR; k += 1) {
        const t = k / SR;
        add(Math.floor(t0 * SR) + k, st.snare * noise() * Math.exp(-t * 26), 0.1);
      }
    }
    const th = t0 + BEAT / 2;
    let prev = 0;
    for (let k = 0; k < 0.05 * SR; k += 1) {
      const t = k / SR;
      const x = noise();
      add(Math.floor(th * SR) + k, st.hat * (x - prev) * Math.exp(-t * 70), -0.2);
      prev = x;
    }
  }

  // Baixo em colcheias.
  for (let e = 0; e * (BEAT / 2) < seconds; e += 1) {
    const f = st.bass[e % st.bass.length];
    if (!f) continue;
    const t0 = e * (BEAT / 2);
    for (let k = 0; k < 0.28 * SR; k += 1) {
      const t = k / SR;
      const env = Math.exp(-t * 7) * Math.min(1, t * 400);
      add(Math.floor(t0 * SR) + k, st.bassAmp * env * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)));
    }
  }

  // Acordes: stabs curtos nos contratempos (energy, bright) ou notas longas (calm).
  for (let b = 0; b * BEAT < seconds; b += 1) {
    if (b % st.chordEvery !== 0) continue;
    const chord = st.chords[Math.floor(b / 4) % st.chords.length];
    const t0 = (b + st.chordOffset) * BEAT;
    for (let k = 0; k < st.chordLen * SR; k += 1) {
      const t = k / SR;
      const env = Math.exp(-t * st.chordDecay) * Math.min(1, t * 300);
      let v = 0;
      for (const f of chord) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(6 * Math.PI * f * t);
      add(Math.floor(t0 * SR) + k, st.chordAmp * env * v, 0.3);
    }
  }

  // Subidas de ruído antes das trocas de cena.
  for (const at of sweeps) {
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
