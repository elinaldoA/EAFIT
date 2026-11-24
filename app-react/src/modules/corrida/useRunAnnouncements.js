import { useEffect, useRef } from 'react';
import { t } from '../../lib/i18n';
import { speak } from '../../lib/voice';
import { phaseAt } from '../../lib/runIntervals';
import { elapsedMs, splitsOf, isPaused } from './liveRun';
import { hrAlert } from './heartRate';
import { gapSpoken } from './ghostText';
import { ghostGapS } from './ghost';
import { spoken } from './workout';
import { formatPace } from './runs';
import { buzz } from './haptics';
import { kmMotivation, timeMotivation, startMotivation, TIME_INTERVAL_S } from './runMotivation';

// "1 quilômetro. Tempo 6 minutos e 10 segundos. Ritmo 6:10 por quilômetro."
function kmAnnouncement(km, totalS, splitS) {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return t('{v1} quilômetro(s). Tempo {v2} minutos e {v3} segundos. Último quilômetro em {v4}.', {
    v1: km, v2: m, v3: s, v4: spoken(formatPace(splitS)),
  });
}

// Avisos de voz e vibração da corrida ao vivo (LiveRunHost.jsx): cada km
// completo (com a diferença para o ghost), troca de fase do corre/caminha e
// frequência cardíaca acima de 80% da máxima numa corrida leve.
// Devolve a fase do corre/caminha (ou null).
export function useRunAnnouncements(run, now, voiceOn, { bpm, maxBpm }) {
  // Voz a cada km completo.
  const kmCount = run?.kmMarks.length || 0;
  const spokenKm = useRef(kmCount);
  useEffect(() => {
    if (!run) { spokenKm.current = 0; return; }
    if (kmCount > spokenKm.current) buzz('km');
    if (kmCount > spokenKm.current && voiceOn) {
      const splits = splitsOf(run.kmMarks);
      const totalS = Math.round(run.kmMarks[kmCount - 1] / 1000);
      const ghostSentence = run.ghost ? ` ${gapSpoken(ghostGapS(run.ghost, totalS, kmCount * 1000))}` : '';
      speak(`${kmAnnouncement(kmCount, totalS, splits[kmCount - 1])}${ghostSentence} ${kmMotivation(kmCount)}`, { queue: true });
    }
    spokenKm.current = kmCount;
  }, [kmCount, run, voiceOn]);

  // Incentivo: ao começar e a cada 4 min sem aviso de km (não no corre/caminha,
  // que já tem seus avisos de fase).
  const isRunWalk = run?.session?.type === 'corre_caminha';
  const startedS = run ? Math.floor(elapsedMs(run, now) / 1000) : 0;
  const lastCheer = useRef(null);
  const cheers = useRef(0);
  useEffect(() => {
    if (!run) { lastCheer.current = null; cheers.current = 0; return; }
    if (!voiceOn || isRunWalk || isPaused(run)) return;
    if (lastCheer.current === null) {
      lastCheer.current = startedS;
      if (startedS < 15) speak(startMotivation(), { queue: true });
      return;
    }
    const lastKmS = kmCount ? Math.round(run.kmMarks[kmCount - 1] / 1000) : 0;
    const since = startedS - Math.max(lastCheer.current, lastKmS);
    if (since >= TIME_INTERVAL_S) {
      lastCheer.current = startedS;
      speak(timeMotivation(cheers.current++), { queue: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedS, voiceOn, isRunWalk, !!run]);

  // Corre/caminha: avisa a troca de fase.
  const session = run?.session;
  const runWalk = session?.type === 'corre_caminha' ? { total: session.minutes, run: session.run, walk: session.walk } : null;
  const phase = runWalk ? phaseAt(elapsedMs(run, now), runWalk) : null;
  const phaseName = phase?.phase || null;
  const lastPhase = useRef(null);
  useEffect(() => {
    if (!phaseName) { lastPhase.current = null; return; }
    if (lastPhase.current && lastPhase.current !== phaseName) buzz(phaseName === 'run' ? 'run' : phaseName === 'walk' ? 'walk' : 'done');
    if (lastPhase.current && lastPhase.current !== phaseName && voiceOn) {
      speak(phaseName === 'run' ? t('Corra!') : phaseName === 'walk' ? t('Caminhe.') : t('Tempo completo. Ótimo trabalho!'));
    }
    lastPhase.current = phaseName;
  }, [phaseName, voiceOn]);

  // Frequência cardíaca alta numa corrida leve.
  const running = !!run && !isPaused(run);
  const hrState = useRef(null);
  const elapsedS = run ? Math.floor(elapsedMs(run, now) / 1000) : 0;
  useEffect(() => {
    if (!running || !voiceOn) { hrState.current = null; return; }
    const r = hrAlert(hrState.current, bpm, maxBpm, elapsedS, run?.session);
    hrState.current = r.state;
    if (r.message) speak(r.message, { queue: true });
    // run.session não muda durante a corrida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedS, bpm, maxBpm, running, voiceOn]);

  return phase;
}
