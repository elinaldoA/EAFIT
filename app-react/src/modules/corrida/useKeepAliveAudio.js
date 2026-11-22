import { useEffect } from 'react';

// Experimento: mantém o app vivo com a tela apagada tocando um áudio mudo em
// loop. iOS e Android (HyperOS, etc.) congelam a página sem som e o GPS para;
// com áudio tocando o sistema costuma deixar a página rodando. Não é garantido
// e gasta um pouco mais de bateria, então só liga com a corrida em GPS rodando.

const SAMPLE_RATE = 8000;
const SECONDS = 2;

// WAV mono 8 bits de silêncio (com 1 de ruído por amostra, para o sistema não
// tratar como arquivo vazio).
export function silentWavBlob() {
  const n = SAMPLE_RATE * SECONDS;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true); v.setUint32(28, SAMPLE_RATE, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128 + (i % 2));
  return new Blob([buf], { type: 'audio/wav' });
}

export function useKeepAliveAudio(enabled) {
  useEffect(() => {
    if (!enabled || typeof Audio === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return undefined;
    let url;
    let audio;
    try {
      url = URL.createObjectURL(silentWavBlob());
      audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.01;
      audio.setAttribute('playsinline', '');
    } catch { return undefined; }

    // play() pode devolver undefined (navegador antigo, jsdom) ou rejeitar (sem toque ainda).
    const tryPlay = () => {
      try { Promise.resolve(audio.play()).then(removeGesture).catch(() => { /* espera um toque */ }); } catch { /* espera um toque */ }
    };
    // O iPhone só deixa tocar a partir de um toque: tenta já e de novo no próximo toque.
    function removeGesture() {
      document.removeEventListener('touchend', tryPlay);
      document.removeEventListener('click', tryPlay);
    }
    document.addEventListener('touchend', tryPlay);
    document.addEventListener('click', tryPlay);
    tryPlay();

    try {
      if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({ title: 'EAFIT Run', artist: 'Corrida em andamento' });
      }
    } catch { /* sem Media Session */ }

    // Se o sistema pausou o áudio (ligação, outro app), tenta voltar ao reabrir a tela.
    const onVis = () => { if (document.visibilityState === 'visible' && audio.paused) tryPlay(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      removeGesture();
      document.removeEventListener('visibilitychange', onVis);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      try { if ('mediaSession' in navigator) navigator.mediaSession.metadata = null; } catch { /* sem Media Session */ }
    };
  }, [enabled]);
}
