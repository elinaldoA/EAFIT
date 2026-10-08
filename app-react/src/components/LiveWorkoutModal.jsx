import { useEffect, useRef, useState } from 'react';
import { trackFeature } from '../lib/tracking';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { todayName } from '../data/treinoData';
import { formatDuration } from '../lib/utils';
import { playRestDoneSound } from '../lib/sound';
import { allSetsDone, countSets, gatherExerciseDetails, setCountOf } from '../lib/workoutSets';
import { useBackToClose } from '../hooks/useBackToClose';
import { useWakeLock } from '../hooks/useWakeLock';
import { isCardioItem } from '../lib/cardio';
import { coachSay, coachStop, speechTime, speechDetail, speechExercise } from '../lib/coach';
import ExerciseDemo from './ExerciseDemo';
import CoachPrompt from './CoachPrompt';

import { t, tEx, tTec, tFoco, tReps } from '../lib/i18n';
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
    trackFeature('live_mode');
    document.body.classList.add('modal-open', 'live-open');
    return () => document.body.classList.remove('modal-open', 'live-open');
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index]);

  // Treinador por voz (opcional, ver lib/coach.js): abertura do treino e a
  // apresentação de cada exercício. O primeiro entra na fila depois da abertura.
  // Também é o que a voz diz ao ser ligada pelo convite (CoachPrompt).
  const coachOpened = useRef(false);
  function announce(first) {
    if (first) {
      // Não chamar de "hoje" um treino de outro dia, nem convidar a treinar de novo
      // um treino que já foi concluído.
      const concluido = timer.status === 'finished' || localStorage.getItem(`treino_${day.dia}`) === 'true';
      const abertura = concluido ? 'review' : day.dia === todayName() ? 'start' : 'startOther';
      coachSay(abertura, { foco: speechExercise(day.foco), dia: day.dia });
    }
    const item = items[index];
    coachSay('exercise', { exercicio: speechExercise(item.nome), detalhe: speechDetail(item) }, { queue: first });
  }
  useEffect(() => {
    const first = !coachOpened.current;
    coachOpened.current = true;
    announce(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => () => coachStop({ keep: ['finish'] }), []);

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
    if (rest && restLeft === 10 && rest.total > 10) coachSay('rest10');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restLeft, rest?.id]);

  useEffect(() => {
    if (!restDone) return;
    playRestDoneSound();
    coachSay('restDone', {}, { delayMs: 3900 }); // depois do alarme, sem sobrepor
    const id = setTimeout(() => setRest(null), 1500);
    return () => clearTimeout(id);
  }, [restDone, rest?.id]);

  function handleRestStart(label, seconds) {
    restSeq.current += 1;
    const start = Date.now();
    setNow(start);
    setRest({ id: restSeq.current, label, total: seconds, endsAt: start + seconds * 1000 });
    coachSay('rest', { tempo: speechTime(seconds) });
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
    <div className="live" role="dialog" aria-modal="true" aria-label={t('Modo treino — {dia}', { dia: t(day.dia) })}>
      <header className="live__top">
        <button type="button" className="live__icon-btn" aria-label={t('Sair do modo treino')} onClick={onClose}>✕</button>
        <div className="live__heading">
          <span className="live__day">{t(day.dia)}</span>
          <span className="live__focus">{tFoco(day.foco)}</span>
        </div>
        <div className="live__top-right">
          <div className={`live__clock${timer.status === 'paused' ? ' live__clock--paused' : ''}`} aria-label={t('Tempo de treino')}>
            {formatDuration(timer.elapsedMs)}
          </div>
          {!isLast && (
            <button type="button" className="link-btn" onClick={onFinish}>{finished ? t('Resumo') : t('Finalizar')}</button>
          )}
        </div>
      </header>

      <div className="live__progress" aria-label={t('{setsDone} de {setsTotal} séries concluídas', { setsDone, setsTotal })}>
        <div className="live__progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="live__steps" role="tablist" aria-label={t('Exercícios do treino')}>
        {items.map((item, i) => (
          <button
            key={item.nome} type="button" role="tab"
            aria-selected={i === index} aria-label={tEx(item.nome)}
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
        <CoachPrompt onEnabled={() => announce(true)} />
        <div className="live__ex-head">
          <span className="live__kicker">
            {t('{v1} {v2}{setsDone}/{setsTotal} séries no total', { v1: isPos ? 'Pós-treino' : `Exercício ${index + 1} de ${day.exercicios.length}`, v2: ' · ', setsDone, setsTotal })}
          </span>
          <h2 className="live__ex-name">{tEx(ex.nome)}</h2>
          <div className="live__chips">
            {setCountOf(ex) > 0 && !isCardioItem(ex) && <span className="live__chip">{t('{series} séries', { series: ex.series })}</span>}
            <span className="live__chip">{tReps(ex.reps)}{setCountOf(ex) > 0 && !isCardioItem(ex) ? ' reps' : ''}</span>
            {ex.descanso && ex.descanso !== '-' && <span className="live__chip">⏱ {ex.descanso}</span>}
            <ExerciseDemo nome={ex.nome} tecnica={ex.tecnica} variant="chip" />
          </div>
          {ex.tecnica && <p className="live__tecnica">💡 {tTec(ex.tecnica)}</p>}
        </div>

        {setCountOf(ex) > 0 ? (
          <div className="live__block">{renderExercise(ex, handleRestStart)}</div>
        ) : (
          <div className="empty-state empty-state--inline">
            <p className="empty-state__text">{t('Sem séries pra registrar aqui — faça o combinado e siga pro próximo.')}</p>
          </div>
        )}

        {exDone && (
          <div className="live__done-note" role="status">
            {t('✅ Exercício concluído')}{next ? <> {t('· próximo:')} <strong>{tEx(next.nome)}</strong></> : ''}
          </div>
        )}
      </main>

      {rest && (
        <div className={`live__rest${restDone ? ' live__rest--done' : ''}`} role="timer" aria-live="polite">
          <div className="live__rest-bar" style={{ width: `${restPct}%` }} />
          <div className="live__rest-row">
            <div className="live__rest-info">
              <span className="live__rest-label">{restDone ? t('Descanso concluído') : t('Descanso')}</span>
              <span className="live__rest-time">
                {restDone ? t('Bora! 💪') : `${String(Math.floor(restLeft / 60)).padStart(2, '0')}:${String(restLeft % 60).padStart(2, '0')}`}
              </span>
            </div>
            {!restDone && (
              <div className="live__rest-actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => addRest(15)}>+15s</button>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => setRest(null)}>{t('Pular')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {timer.status === 'paused' && (
        <div className="live__paused" role="status">
          <span>{t('⏸ Treino pausado')}</span>
          <button type="button" className="btn btn--primary btn--sm" onClick={timer.resume}>{t('▶ Continuar')}</button>
        </div>
      )}

      <footer className="live__footer">
        <button
          type="button" className="live__nav-btn" aria-label={t('Exercício anterior')}
          disabled={index === 0} onClick={() => setIndex(i => i - 1)}
        >‹</button>
        {!finished && (
          <button
            type="button" className="live__nav-btn"
            aria-label={timer.status === 'paused' ? t('Continuar treino') : t('Pausar treino')}
            onClick={timer.status === 'paused' ? timer.resume : timer.pause}
          >{timer.status === 'paused' ? '▶' : '⏸'}</button>
        )}
        {isLast ? (
          <button type="button" className="btn btn--primary live__next" onClick={onFinish}>
            {finished ? t('📋 Ver resumo') : t('🏁 Finalizar treino')}
          </button>
        ) : (
          <button
            type="button"
            className={`btn live__next ${exDone || setCountOf(ex) === 0 ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setIndex(i => i + 1)}
          >
            {t('Próximo')} <span aria-hidden="true">›</span>
          </button>
        )}
      </footer>
    </div>,
    getModalRoot()
  );
}
