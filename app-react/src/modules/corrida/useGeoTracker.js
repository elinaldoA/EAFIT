import { useEffect, useRef, useState } from 'react';
import { emptyTrack, applyFix } from './geoTrack';

// Sem leitura aceita por tanto tempo (ms) o sinal conta como fraco.
const WEAK_AFTER_MS = 15000;
// Procurando há tanto tempo (ms) sem nenhuma leitura boa: mostra a dica.
const SLOW_AFTER_MS = 30000;
// Precisão pior que isso (m) é localização aproximada (Wi-Fi/rede ou
// "localização precisa" desligada no celular), não GPS.
const APPROX_M = 500;
// Intervalo sem leitura aceita (ms) a partir do qual a próxima não liga ao ponto
// anterior no desenho: app em segundo plano ou GPS parado, a linha reta entre os
// dois pontos não é o caminho feito. A distância continua somando em linha reta.
export const ROUTE_GAP_MS = 60000;

export const geoSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

// Acompanha o GPS enquanto `active` (corrida rodando, não pausada) e soma a
// distância a partir de `baseMeters`, já filtrada por geoTrack.js. Chama
// onMeters(total) a cada leitura aceita. Ao pausar, para o rastreio e esquece
// a posição: o trecho parado não vira distância. onFix({ lat, lon, jump, altitude, altitudeAccuracy })
// recebe cada ponto aceito, para o desenho do percurso (route.js).
//
// paused (pausa automática): o rastreio segue e acompanha a posição, mas não
// soma distância nem manda pontos. onSample({ t, reason, meters }) recebe toda
// leitura classificada (meters = deslocamento aceito), para autoPause.js.
//
// status: 'idle' | 'searching' | 'slow' | 'approx' | 'tracking' | 'weak' | 'denied' | 'insecure' | 'unsupported' | 'error'
// accuracy é a precisão (m) da última leitura, aceita ou não, para a tela
// mostrar que o sinal está chegando mesmo antes de ficar bom.
export function useGeoTracker({ active, paused = false, baseMeters, onMeters, onFix, onSample }) {
  const [status, setStatus] = useState('idle');
  const [accuracy, setAccuracy] = useState(null);
  const baseRef = useRef(baseMeters);
  const onMetersRef = useRef(onMeters);
  const onFixRef = useRef(onFix);
  const onSampleRef = useRef(onSample);
  const pausedRef = useRef(paused);
  baseRef.current = baseMeters;
  onMetersRef.current = onMeters;
  onFixRef.current = onFix;
  onSampleRef.current = onSample;
  pausedRef.current = paused;

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
        const { latitude: lat, longitude: lon, accuracy: acc, altitude, altitudeAccuracy } = pos.coords;
        const before = track.meters;
        const gap = track.last ? pos.timestamp - track.last.t : 0;
        const result = applyFix(track, { lat, lon, accuracy: acc, t: pos.timestamp });
        const moved = result.reason === 'moved' ? result.track.meters - before : 0;
        const paused = pausedRef.current;
        // Pausado: a posição anda (âncora nova), a distância não.
        track = paused ? { ...result.track, meters: before } : result.track;
        failed = false;
        lastAcc = Number.isFinite(acc) ? Math.round(acc) : null;
        setAccuracy(lastAcc);
        if (!lastAcceptedAt && !result.accepted) {
          setStatus(lastAcc > APPROX_M ? 'approx' : Date.now() - startedAt > SLOW_AFTER_MS ? 'slow' : 'searching');
        }
        if (result.accepted) {
          lastAcceptedAt = Date.now();
          setStatus('tracking');
          if (!paused) {
            onFixRef.current?.({ lat, lon, jump: result.reason === 'jump' || gap > ROUTE_GAP_MS, altitude, altitudeAccuracy });
            if (result.reason !== 'first') onMetersRef.current?.(Math.round(track.meters));
          }
        }
        onSampleRef.current?.({ t: pos.timestamp, reason: result.reason, meters: moved });
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
