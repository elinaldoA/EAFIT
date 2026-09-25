import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { formatDuration } from '../lib/utils';
import { playRestDoneSound } from '../lib/sound';
import { allSetsDone, countSets, gatherExerciseDetails } from '../lib/workoutSets';
import { useBackToClose } from '../hooks/useBackToClose';
import { useWakeLock } from '../hooks/useWakeLock';
import ExerciseDemo from './ExerciseDemo';

function setCountOf(ex) {
  return parseInt(ex.series, 10) || 0;
}

function isExerciseDone(ex) {
  const n = setCountOf(ex);
  return n > 0 && allSetsDone(ex, n);
}

// Modo treino ao vivo: um exercício por vez em tela cheia, com o descanso
// embutido (sem modal bloqueando a próxima série) e a tela sempre acesa.
// Os blocos de exercício vêm prontos do DayCard (renderExercise) — o mesmo
// ExerciseBlock/SetRow da lista, então salvar, sugestões e recordes funcionam
// igual nos dois modos. Re-renderiza a cada bump() da TreinoPage e a cada
// tique do cronômetro do DayCard.
export default function LiveWorkoutModal({ day, timer, renderExercise, onFinish, onClose }) {
  useBackToClose(onClose);
  useWakeLock();
  const items = [...day.exercicios, ...day.pos];
  const [index, setIndex] = useState(() => {
    const firstPending = items.findIndex(ex => setCountOf(ex) > 0 && !isExerciseDone(ex));
    return firstPending === -1 ? 0 : firstPending;
  });
  const [rest, setRest] = useState(null); // { id, label, total, endsAt }
  const [now, setNow] = useState(() => Date.now());
  const restSeq = useRef(0);
  const bodyRef = useRef(null);

  useEffect(() => {
    // live-open: sobe o toast pro topo, longe do descanso e do rodapé (live.css)
    document.body.classList.add('modal-open', 'live-open');
    return () => document.body.classList.remove('modal-open', 'live-open');
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index]);

  // Conta o descanso pelo horário de término (não por decremento a cada
  // segundo): com a tela bloqueada ou o app em segundo plano o setInterval
  // atrasa, mas o tempo restante continua certo ao voltar.
  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rest]);

  const restLeft = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;
  const restDone = !!rest && restLeft === 0;

  useEffect(() => {
    if (!restDone) return;
    playRestDoneSound();
    const id = setTimeout(() => setRest(null), 1500);
    return () => clearTimeout(id);
  }, [restDone, rest?.id]);

  function handleRestStart(label, seconds) {
    restSeq.current += 1;
    const start = Date.now();
    setNow(start);
    setRest({ id: restSeq.current, label, total: seconds, endsAt: start + seconds * 1000 });
  }

  function addRest(seconds) {
    setRest(r => r && { ...r, total: r.total + seconds, endsAt: r.endsAt + seconds * 1000 });
  }

  const ex = items[index];
  const isLast = index === items.length - 1;
  const exDone = isExerciseDone(ex);
  const { done: setsDone, total: setsTotal } = countSets(gatherExerciseDetails(day));
  const pct = setsTotal ? (setsDone / setsTotal) * 100 : 0;
  const finished = timer.status === 'finished';
  const isPos = index >= day.exercicios.length;
  const next = items[index + 1];
  const restPct = rest ? Math.min(100, ((rest.total - restLeft) / rest.total) * 100) : 0;

  return createPortal(
    <div className="live" role="dialog" aria-modal="true" aria-label={`Modo treino — ${day.dia}`}>
      <header className="live__top">
        <button type="button" className="live__icon-btn" aria-label="Sair do modo treino" onClick={onClose}>✕</button>
        <div className="live__heading">
          <span className="live__day">{day.dia}</span>
          <span className="live__focus">{day.foco}</span>
        </div>
        <div className="live__top-right">
          <div className={`live__clock${timer.status === 'paused' ? ' live__clock--paused' : ''}`} aria-label="Tempo de treino">
            {formatDuration(timer.elapsedMs)}
          </div>
          {!isLast && (
            <button type="button" className="link-btn" onClick={onFinish}>{finished ? 'Resumo' : 'Finalizar'}</button>
          )}
        </div>
      </header>

      <div className="live__progress" aria-label={`${setsDone} de ${setsTotal} séries concluídas`}>
        <div className="live__progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="live__steps" role="tablist" aria-label="Exercícios do treino">
        {items.map((item, i) => (
          <button
            key={item.nome} type="button" role="tab"
            aria-selected={i === index} aria-label={item.nome}
            className={[
              'live__step',
              i === index && 'live__step--current',
              isExerciseDone(item) && 'live__step--done',
              i >= day.exercicios.length && 'live__step--pos',
            ].filter(Boolean).join(' ')}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>

      <main className="live__body" ref={bodyRef}>
        <div className="live__ex-head">
          <span className="live__kicker">
            {isPos ? 'Pós-treino' : `Exercício ${index + 1} de ${day.exercicios.length}`}
            {' · '}{setsDone}/{setsTotal} séries no total
          </span>
          <h2 className="live__ex-name">{ex.nome}</h2>
          <div className="live__chips">
            {setCountOf(ex) > 0 && <span className="live__chip">{ex.series} séries</span>}
            <span className="live__chip">{ex.reps}{setCountOf(ex) > 0 ? ' reps' : ''}</span>
            {ex.descanso && ex.descanso !== '-' && <span className="live__chip">⏱ {ex.descanso}</span>}
            <ExerciseDemo nome={ex.nome} tecnica={ex.tecnica} variant="chip" />
          </div>
          {ex.tecnica && <p className="live__tecnica">💡 {ex.tecnica}</p>}
        </div>

        {setCountOf(ex) > 0 ? (
          <div className="live__block">{renderExercise(ex, handleRestStart)}</div>
        ) : (
          <div className="empty-state empty-state--inline">
            <p className="empty-state__text">Sem séries pra registrar aqui — faça o combinado e siga pro próximo.</p>
          </div>
        )}

        {exDone && (
          <div className="live__done-note" role="status">
            ✅ Exercício concluído{next ? <> · próximo: <strong>{next.nome}</strong></> : ''}
          </div>
        )}
      </main>

      {rest && (
        <div className={`live__rest${restDone ? ' live__rest--done' : ''}`} role="timer" aria-live="polite">
          <div className="live__rest-bar" style={{ width: `${restPct}%` }} />
          <div className="live__rest-row">
            <div className="live__rest-info">
              <span className="live__rest-label">{restDone ? 'Descanso concluído' : 'Descanso'}</span>
              <span className="live__rest-time">
                {restDone ? 'Bora! 💪' : `${String(Math.floor(restLeft / 60)).padStart(2, '0')}:${String(restLeft % 60).padStart(2, '0')}`}
              </span>
            </div>
            {!restDone && (
              <div className="live__rest-actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => addRest(15)}>+15s</button>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => setRest(null)}>Pular</button>
              </div>
            )}
          </div>
        </div>
      )}

      {timer.status === 'paused' && (
        <div className="live__paused" role="status">
          <span>⏸ Treino pausado</span>
          <button type="button" className="btn btn--primary btn--sm" onClick={timer.resume}>▶ Continuar</button>
        </div>
      )}

      <footer className="live__footer">
        <button
          type="button" className="live__nav-btn" aria-label="Exercício anterior"
          disabled={index === 0} onClick={() => setIndex(i => i - 1)}
        >‹</button>
        {!finished && (
          <button
            type="button" className="live__nav-btn"
            aria-label={timer.status === 'paused' ? 'Continuar treino' : 'Pausar treino'}
            onClick={timer.status === 'paused' ? timer.resume : timer.pause}
          >{timer.status === 'paused' ? '▶' : '⏸'}</button>
        )}
        {isLast ? (
          <button type="button" className="btn btn--primary live__next" onClick={onFinish}>
            {finished ? '📋 Ver resumo' : '🏁 Finalizar treino'}
          </button>
        ) : (
          <button
            type="button"
            className={`btn live__next ${exDone || setCountOf(ex) === 0 ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setIndex(i => i + 1)}
          >
            Próximo <span aria-hidden="true">›</span>
          </button>
        )}
      </footer>
    </div>,
    getModalRoot()
  );
}
