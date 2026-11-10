import { useCallback, useEffect, useRef, useState } from 'react';
import { ZONE_COUNT, hrSupported, parseHeartRate, zoneOf } from './heartRate';

const FLUSH_MS = 5000;
// Entre duas leituras seguidas, no máximo este tempo conta para a zona (cinta que falha não infla).
const MAX_GAP_S = 5;
const SERVICE = 'heart_rate';
const CHARACTERISTIC = 'heart_rate_measurement';
const emptyAcc = () => ({ sum: 0, n: 0, max: 0, zones: Array(ZONE_COUNT).fill(0), last: null });

// Cinta cardíaca por Bluetooth. `connect()` precisa vir de um toque (regra do
// navegador). Enquanto `recording` (corrida rodando), junta as leituras e, a
// cada FLUSH_MS, chama onFlush(soma, quantas, máxima, segundosPorZona), com as
// zonas em null se a pessoa não tem frequência máxima (maxHeartRate). A
// leitura do momento (bpm) aparece sempre que a cinta está conectada.
// status: 'off' | 'connecting' | 'on' | 'error'
export function useHeartRate(recording, onFlush, hrMax = null) {
  const [status, setStatus] = useState('off');
  const [bpm, setBpm] = useState(null);
  const device = useRef(null);
  const acc = useRef(emptyAcc());
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const hrMaxRef = useRef(hrMax);
  hrMaxRef.current = hrMax;
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const flush = useCallback(() => {
    const { sum, n, max, zones, last } = acc.current;
    acc.current = { ...emptyAcc(), last };
    if (n > 0) onFlushRef.current?.(sum, n, max, hrMaxRef.current ? zones : null);
  }, []);

  const disconnect = useCallback(() => {
    const d = device.current;
    device.current = null;
    if (d?.gatt?.connected) d.gatt.disconnect();
    setStatus('off');
    setBpm(null);
  }, []);

  const connect = useCallback(async () => {
    if (!hrSupported()) return;
    setStatus('connecting');
    try {
      const d = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
      d.addEventListener('gattserverdisconnected', () => {
        if (device.current === d) { device.current = null; setStatus('error'); setBpm(null); }
      });
      const server = await d.gatt.connect();
      const service = await server.getPrimaryService(SERVICE);
      const ch = await service.getCharacteristic(CHARACTERISTIC);
      ch.addEventListener('characteristicvaluechanged', e => {
        const v = parseHeartRate(e.target.value);
        if (v == null) return;
        setBpm(v);
        const at = Date.now();
        const a = acc.current;
        // O relógio da última leitura anda sempre; só a corrida rodando soma.
        if (!recordingRef.current) { acc.current = { ...a, last: at }; return; }
        const dt = a.last == null ? 1 : Math.min(MAX_GAP_S, Math.max(0, (at - a.last) / 1000));
        const zones = [...a.zones];
        if (hrMaxRef.current) zones[zoneOf(v, hrMaxRef.current)] += dt;
        acc.current = { sum: a.sum + v, n: a.n + 1, max: Math.max(a.max, v), zones, last: at };
      });
      await ch.startNotifications();
      device.current = d;
      setStatus('on');
    } catch (err) {
      // Escolher "cancelar" na lista de aparelhos não é erro.
      setStatus(err?.name === 'NotFoundError' ? 'off' : 'error');
    }
  }, []);

  useEffect(() => {
    if (status !== 'on') return undefined;
    const id = setInterval(flush, FLUSH_MS);
    return () => { clearInterval(id); flush(); };
  }, [status, flush]);

  useEffect(() => () => {
    const d = device.current;
    device.current = null;
    if (d?.gatt?.connected) d.gatt.disconnect();
  }, []);

  return { status, bpm, connect, disconnect };
}
