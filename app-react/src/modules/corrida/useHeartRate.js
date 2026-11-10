import { useCallback, useEffect, useRef, useState } from 'react';
import { hrSupported, parseHeartRate } from './heartRate';

const FLUSH_MS = 5000;
const SERVICE = 'heart_rate';
const CHARACTERISTIC = 'heart_rate_measurement';

// Cinta cardíaca por Bluetooth. `connect()` precisa vir de um toque (regra do
// navegador). Enquanto `recording` (corrida rodando), junta as leituras e, a
// cada FLUSH_MS, chama onFlush(soma, quantas, máxima); a leitura do momento
// (bpm) aparece sempre que a cinta está conectada.
// status: 'off' | 'connecting' | 'on' | 'error'
export function useHeartRate(recording, onFlush) {
  const [status, setStatus] = useState('off');
  const [bpm, setBpm] = useState(null);
  const device = useRef(null);
  const acc = useRef({ sum: 0, n: 0, max: 0 });
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const flush = useCallback(() => {
    const { sum, n, max } = acc.current;
    acc.current = { sum: 0, n: 0, max: 0 };
    if (n > 0) onFlushRef.current?.(sum, n, max);
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
        if (recordingRef.current) {
          const a = acc.current;
          acc.current = { sum: a.sum + v, n: a.n + 1, max: Math.max(a.max, v) };
        }
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
