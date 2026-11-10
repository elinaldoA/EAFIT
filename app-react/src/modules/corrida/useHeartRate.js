import { useCallback, useEffect, useRef, useState } from 'react';
import { ZONE_COUNT, hrSupported, parseHeartRate, zoneOf } from './heartRate';

const FLUSH_MS = 5000;
// Entre duas leituras seguidas, no máximo este tempo conta para a zona (cinta que falha não infla).
const MAX_GAP_S = 5;
const SERVICE = 'heart_rate';
const CHARACTERISTIC = 'heart_rate_measurement';
const emptyAcc = () => ({ sum: 0, n: 0, max: 0, zones: Array(ZONE_COUNT).fill(0), last: null });

// Tira os ouvintes e solta a cinta (a conexão aberta prenderia a cinta, e um ouvinte
// esquecido contaria cada leitura duas vezes ao ligar de novo no mesmo aparelho).
const drop = c => {
  if (!c) return;
  c.ch?.removeEventListener('characteristicvaluechanged', c.onValue);
  c.device?.removeEventListener('gattserverdisconnected', c.onDrop);
  if (c.device?.gatt?.connected) c.device.gatt.disconnect();
};

// Cinta cardíaca por Bluetooth. `connect()` precisa vir de um toque (regra do
// navegador). Enquanto `recording` (corrida rodando), junta as leituras e, a
// cada FLUSH_MS, chama onFlush(soma, quantas, máxima, segundosPorZona), com as
// zonas em null se a pessoa não tem frequência máxima (maxHeartRate). A
// leitura do momento (bpm) aparece sempre que a cinta está conectada.
// status: 'off' | 'connecting' | 'on' | 'error'
export function useHeartRate(recording, onFlush, hrMax = null) {
  const [status, setStatus] = useState('off');
  const [bpm, setBpm] = useState(null);
  const link = useRef(null);
  const alive = useRef(true);
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

  const release = useCallback(() => {
    const c = link.current;
    link.current = null;
    drop(c);
  }, []);

  const disconnect = useCallback(() => {
    release();
    setStatus('off');
    setBpm(null);
  }, [release]);

  const connect = useCallback(async () => {
    if (!hrSupported() || link.current) return;
    const mine = {};
    link.current = mine;
    setStatus('connecting');
    try {
      const d = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE] }] });
      mine.device = d;
      mine.onDrop = () => {
        if (link.current !== mine) return;
        release();
        if (alive.current) { setStatus('error'); setBpm(null); }
      };
      d.addEventListener('gattserverdisconnected', mine.onDrop);
      const server = await d.gatt.connect();
      const service = await server.getPrimaryService(SERVICE);
      const ch = await service.getCharacteristic(CHARACTERISTIC);
      mine.ch = ch;
      mine.onValue = e => {
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
      };
      ch.addEventListener('characteristicvaluechanged', mine.onValue);
      await ch.startNotifications();
      // A tela saiu ou a pessoa desconectou enquanto a conexão abria: solta a cinta.
      if (!alive.current || link.current !== mine) { drop(mine); return; }
      setStatus('on');
    } catch (err) {
      if (link.current === mine) link.current = null;
      drop(mine);
      if (alive.current) setStatus(err?.name === 'NotFoundError' ? 'off' : 'error');
    }
  }, [release]);

  useEffect(() => {
    if (status !== 'on') return undefined;
    const id = setInterval(flush, FLUSH_MS);
    return () => { clearInterval(id); flush(); };
  }, [status, flush]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; release(); };
  }, [release]);

  return { status, bpm, connect, disconnect };
}
