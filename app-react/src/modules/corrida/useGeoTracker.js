import { useEffect, useRef, useState } from 'react';
import { emptyTrack, applyFix } from './geoTrack';

// Sem leitura aceita por tanto tempo (ms) o sinal conta como fraco.
const WEAK_AFTER_MS = 15000;
// Procurando há tanto tempo (ms) sem nenhuma leitura boa: mostra a dica.
const SLOW_AFTER_MS = 30000;
// Precisão pior que isso (m) é localização aproximada (Wi-Fi/rede ou
// "localização precisa" desligada no celular), não GPS.
const APPROX_M = 500;

export const geoSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

// Acompanha o GPS enquanto `active` (corrida rodando, não pausada) e soma a
// distância a partir de `baseMeters`, já filtrada por geoTrack.js. Chama
// onMeters(total) a cada leitura aceita. Ao pausar, para o rastreio e esquece
// a posição: o trecho parado não vira distância. onFix({ lat, lon, jump })
// recebe cada ponto aceito, para o desenho do percurso (route.js).
//
// status: 'idle' | 'searching' | 'slow' | 'approx' | 'tracking' | 'weak' | 'denied' | 'insecure' | 'unsupported' | 'error'
// accuracy é a precisão (m) da última leitura, aceita ou não, para a tela
// mostrar que o sinal está chegando mesmo antes de ficar bom.
export function useGeoTracker({ active, baseMeters, onMeters, onFix }) {
  const [status, setStatus] = useState('idle');
  const [accuracy, setAccuracy] = useState(null);
  const baseRef = useRef(baseMeters);
  const onMetersRef = useRef(onMeters);
  const onFixRef = useRef(onFix);
  baseRef.current = baseMeters;
  onMetersRef.current = onMeters;
  onFixRef.current = onFix;

  useEffect(() => {
    if (!active) { setStatus('idle'); setAccuracy(null); return undefined; }
    if (!geoSupported()) { setStatus('unsupported'); return undefined; }
    // Em http (ex.: IP da rede local) o navegador bloqueia a localização sem perguntar.
    if (typeof window !== 'undefined' && window.isSecureContext === false) { setStatus('insecure'); return undefined; }

    const geolocation = navigator.geolocation;
    let track = emptyTrack(Math.max(0, baseRef.current || 0));
    const startedAt = Date.now();
    let lastAcceptedAt = 0;
    let lastAcc = null;
    let failed = false;
    setStatus('searching');
    setAccuracy(null);

    const watchId = geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
        const result = applyFix(track, { lat, lon, accuracy: acc, t: pos.timestamp });
        track = result.track;
        failed = false;
        lastAcc = Number.isFinite(acc) ? Math.round(acc) : null;
        setAccuracy(lastAcc);
        if (!lastAcceptedAt && !result.accepted) {
          setStatus(lastAcc > APPROX_M ? 'approx' : Date.now() - startedAt > SLOW_AFTER_MS ? 'slow' : 'searching');
        }
        if (result.accepted) {
          lastAcceptedAt = Date.now();
          setStatus('tracking');
          onFixRef.current?.({ lat, lon, jump: result.reason === 'jump' });
          if (result.reason !== 'first') onMetersRef.current?.(Math.round(track.meters));
        }
      },
      err => {
        // Timeout (3) só quer dizer que a leitura demorou: o rastreio continua
        // e a próxima leitura chega sozinha. Não é erro.
        if (err.code === 3) return;
        failed = true;
        setStatus(err.code === 1 ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );

    const watchdog = setInterval(() => {
      if (failed) return;
      const now = Date.now();
      if (lastAcceptedAt) {
        if (now - lastAcceptedAt > WEAK_AFTER_MS) setStatus(s => (s === 'tracking' ? 'weak' : s));
      } else if (now - startedAt > SLOW_AFTER_MS && !(lastAcc > APPROX_M)) {
        setStatus(s => (s === 'searching' ? 'slow' : s));
      }
    }, 3000);

    return () => {
      geolocation.clearWatch(watchId);
      clearInterval(watchdog);
    };
  }, [active]);

  return { status, accuracy };
}
