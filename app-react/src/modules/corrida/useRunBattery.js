import { useEffect, useRef, useState } from 'react';
import { speak } from '../../lib/voice';
import { buzz } from './haptics';
import { useBattery } from './useBattery';
import { batteryState, batterySpoken, batteryReadable, nudgeBlock, nudgeSpoken } from './battery';

// Bateria na corrida ao vivo (LiveRunHost.jsx): banner quando está acabando e,
// ao cruzar 20% e 10%, vibra e avisa por voz. Sem leitura de bateria (iPhone),
// a cada 45 min de corrida um lembrete para poupar bateria.
export function useRunBattery(run, { interrupted, voiceOn, elapsedS }) {
  const hasRun = !!run;
  const battery = useBattery(hasRun && !interrupted);
  const level = battery?.level ?? null;
  const state = battery ? batteryState(battery.level, battery.charging) : 'ok';
  const last = useRef('ok');

  useEffect(() => {
    if (!hasRun) { last.current = 'ok'; return; }
    const prev = last.current;
    last.current = state;
    // Só quando piora (ok → baixa → crítica); carregar e voltar a descer avisa de novo.
    if (state !== 'ok' && state !== prev && !(prev === 'critical' && state === 'low')) {
      buzz('battery');
      if (voiceOn) speak(batterySpoken(state, level), { queue: true });
    }
    // level e voiceOn só entram na fala: não devem disparar o aviso sozinhos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hasRun]);

  const [nudge, setNudge] = useState(false);
  const seen = useRef(null);
  const block = nudgeBlock(elapsedS);
  useEffect(() => {
    if (!hasRun) { seen.current = null; setNudge(false); return; }
    // Primeira leitura (ou corrida retomada já adiantada): só marca onde está, sem avisar.
    if (seen.current === null) { seen.current = block; return; }
    if (block > seen.current && !batteryReadable()) {
      setNudge(true);
      buzz('battery');
      if (voiceOn) speak(nudgeSpoken(), { queue: true });
    }
    seen.current = Math.max(seen.current, block);
    // voiceOn só entra na fala
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block, hasRun]);
  // O lembrete some sozinho depois de um tempo, para não ficar tapando a tela.
  useEffect(() => {
    if (!nudge) return undefined;
    const id = setTimeout(() => setNudge(false), 20000);
    return () => clearTimeout(id);
  }, [nudge]);

  return { battery, nudge, dismissNudge: () => setNudge(false) };
}
