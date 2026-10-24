import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { useBackToClose } from '../hooks/useBackToClose';
import { useWakeLock } from '../hooks/useWakeLock';
import { trackFeature } from '../lib/tracking';
import { playStepSound, playWorkoutFinishedSound } from '../lib/sound';
import { moveTiming, routineSeconds, markMobilityDone, TRANSITION_SECONDS } from '../lib/mobility';
import { formatDuration } from '../lib/utils';
import ExerciseDemo from './ExerciseDemo';

import { t, tEx, tTec } from '../lib/i18n';

// Mobilidade/alongamento guiado (ver lib/mobility.js): um movimento por vez,
// com contagem regressiva, aviso para trocar de lado na metade e alguns
// segundos para se posicionar no próximo. Conta pelo horário de término, como
// o descanso do modo treino, para não atrasar com a tela bloqueada.
// stage: 'intro' → ('prep' ↔ 'move')… → 'done'
export default function MobilitySession({ moves, phase, title, onClose }) {
  useBackToClose(onClose);
  useWakeLock();
  const [stage, setStage] = useState('intro');
  const [index, setIndex] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [pausedLeft, setPausedLeft] = useState(null); // ms restantes quando pausado
  const [now, setNow] = useState(() => Date.now());
  const switched = useRef(false);

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const running = (stage === 'prep' || stage === 'move') && pausedLeft === null;
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const move = moves[index];
  const timing = move ? moveTiming(move) : { seconds: 0, sides: false };
  const leftMs = pausedLeft ?? Math.max(0, endsAt - now);
  const left = Math.ceil(leftMs / 1000);

  function begin(nextStage, seconds) {
    switched.current = false;
    setPausedLeft(null);
    setNow(Date.now());
    setEndsAt(Date.now() + seconds * 1000);
    setStage(nextStage);
  }

  function finish() {
    markMobilityDone(phase);
    trackFeature('mobility');
    playWorkoutFinishedSound();
    setStage('done');
  }

  function next() {
    if (index + 1 >= moves.length) { finish(); return; }
    setIndex(i => i + 1);
    begin('prep', TRANSITION_SECONDS);
  }

  useEffect(() => {
    if (!running || left > 0) return;
    if (stage === 'prep') {
      playStepSound();
      begin('move', timing.seconds);
    } else {
      next();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, running, stage]);

  // Metade do tempo de um movimento "cada lado": avisa para trocar.
  const half = Math.floor(timing.seconds / 2);
  const showSwitch = stage === 'move' && timing.sides && left <= half;
  useEffect(() => {
    if (showSwitch && !switched.current) {
      switched.current = true;
      playStepSound();
    }
  }, [showSwitch]);

  function togglePause() {
    if (pausedLeft === null) setPausedLeft(Math.max(0, endsAt - Date.now()));
    else {
      setEndsAt(Date.now() + pausedLeft);
      setNow(Date.now());
      setPausedLeft(null);
    }
  }

  const total = stage === 'prep' ? TRANSITION_SECONDS : timing.seconds;
  const pct = total ? Math.min(100, ((total - left) / total) * 100) : 0;

  return createPortal(
    <div className="mobility" role="dialog" aria-modal="true" aria-labelledby="mobility-title">
      <div className="mobility__top">
        <span className="mobility__kicker" id="mobility-title">{title}</span>
        {stage !== 'intro' && stage !== 'done' && (
          <span className="mobility__count">{t('{n} de {total}', { n: index + 1, total: moves.length })}</span>
        )}
        <button type="button" className="rating-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
      </div>

      {stage === 'intro' && (
        <div className="mobility__body">
          <p className="mobility__lead">
            {t('{n} movimentos · cerca de {min} min. O app conta o tempo e avisa a hora de trocar de lado.', { n: moves.length, min: Math.max(1, Math.round(routineSeconds(moves) / 60)) })}
          </p>
          <ol className="mobility__list">
            {moves.map(m => (
              <li key={m.nome}>
                <span>{tEx(m.nome)}</span>
                <span className="mobility__dose">{formatDuration(moveTiming(m).seconds * 1000)}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn--primary btn--full" onClick={() => begin('prep', TRANSITION_SECONDS)}>{t('▶ Começar')}</button>
        </div>
      )}

      {(stage === 'prep' || stage === 'move') && move && (
        <div className="mobility__body mobility__body--run">
          <span className="mobility__phase">{stage === 'prep' ? t('Prepare-se') : (showSwitch ? t('🔄 Troque de lado') : t('Agora'))}</span>
          <h2 className="mobility__name">{tEx(move.nome)}</h2>
          <p className="mobility__cue">{tTec(move.tecnica)}</p>
          <ExerciseDemo nome={move.nome} tecnica={move.tecnica} />
          <div className={`mobility__ring${stage === 'prep' ? ' mobility__ring--prep' : ''}`} style={{ '--pct': pct }}>
            <span>{left}</span>
          </div>
          <div className="mobility__controls">
            <button type="button" className="btn btn--outline btn--sm" onClick={togglePause}>
              {pausedLeft === null ? t('⏸ Pausar') : t('▶ Continuar')}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={next}>{t('Pular ⏭')}</button>
          </div>
          {moves[index + 1] && (
            <p className="mobility__next">{t('Próximo: {nome}', { nome: tEx(moves[index + 1].nome) })}</p>
          )}
        </div>
      )}

      {stage === 'done' && (
        <div className="mobility__body">
          <div className="mobility__done" aria-hidden="true">🧘</div>
          <h2 className="mobility__name">{t('Mobilidade concluída!')}</h2>
          <p className="mobility__lead">{phase === 'pre' ? t('Corpo aquecido — bom treino!') : t('Boa recuperação. Beba água e descanse bem.')}</p>
          <button type="button" className="btn btn--primary btn--full" onClick={onClose}>{t('Fechar')}</button>
        </div>
      )}
    </div>,
    getModalRoot()
  );
}
