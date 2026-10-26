import { useEffect, useRef, useState } from 'react';
import { emptyTrack, applyFix } from '../lib/geoTrack';

// Sem leitura aceita por tanto tempo (ms) o sinal conta como fraco.
const WEAK_AFTER_MS = 15000;

export const geoSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

// Acompanha o GPS enquanto `active` for verdadeiro (cronômetro correndo) e soma
// a distância a partir de `baseKm`, já filtrada por lib/geoTrack. Chama
// onDistance(km) a cada leitura aceita (arredondado a 10 m). Ao desativar
// (pausa) para o rastreio e esquece a posição, então o trecho parado não conta.
// Só guarda o total: nenhuma coordenada sai daqui nem vai para o banco.
//
// status: 'idle' | 'searching' | 'tracking' | 'weak' | 'denied' | 'unsupported' | 'error'
export function useGeoTracker({ active, baseKm, onDistance }) {
  const [status, setStatus] = useState('idle');
  const [accuracy, setAccuracy] = useState(null);
  const baseRef = useRef(baseKm);
  const onDistanceRef = useRef(onDistance);
  baseRef.current = baseKm;
  onDistanceRef.current = onDistance;

  useEffect(() => {
    if (!active) { setStatus('idle'); setAccuracy(null); return; }
    if (!geoSupported()) { setStatus('unsupported'); return; }

    const geolocation = navigator.geolocation;
    let track = emptyTrack(Math.max(0, parseFloat(baseRef.current) || 0) * 1000);
    let lastAcceptedAt = Date.now();
    let failed = false;
    setStatus('searching');

    const watchId = geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
        const result = applyFix(track, { lat, lon, accuracy: acc, t: pos.timestamp });
        track = result.track;
        setAccuracy(Math.round(acc));
        if (result.accepted) {
          lastAcceptedAt = Date.now();
          failed = false;
          setStatus('tracking');
          if (result.reason !== 'first') onDistanceRef.current?.(Math.round(track.meters / 10) / 100);
        }
      },
      err => {
        failed = true;
        setStatus(err.code === 1 ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );

    const watchdog = setInterval(() => {
      if (!failed && Date.now() - lastAcceptedAt > WEAK_AFTER_MS) setStatus(s => (s === 'tracking' ? 'weak' : s));
    }, 3000);

    return () => {
      geolocation.clearWatch(watchId);
      clearInterval(watchdog);
    };
  }, [active]);

  return { status, accuracy };
}
