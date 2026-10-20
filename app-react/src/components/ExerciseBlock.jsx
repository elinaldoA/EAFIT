import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { fetchProgressionSuggestion, fetchPlateauStatus } from '../lib/records';
import { fetchRecentDiscomfort } from '../lib/discomfort';
import { substituteExercise } from '../lib/workoutPlans';
import { logExerciseSwap } from '../lib/tracking';
import { getSaferAlternative } from '../data/workoutTemplates';
import { allSetsDone } from '../lib/workoutSets';
import { DiscomfortPanel } from './DiscomfortWidgets';
import { isCardioItem } from '../lib/cardio';
import { coachSuggest } from '../lib/coach';
import SetRow from './SetRow';
import WarmupSets from './WarmupSets';
import { warmupCount } from '../lib/warmup';
import CardioRow from './CardioRow';
import ExerciseDemo from './ExerciseDemo';
import ExerciseSwap from './ExerciseSwap';

import { t, tEx, tReps } from '../lib/i18n';
// hideName: o modo treino ao vivo já mostra nome/meta do exercício em
// destaque no próprio cabeçalho, então o bloco omite os dele.
export default function ExerciseBlock({ ex, day, bump, onRestStart, onSetDone, open, version, onToggleAll, onFillOthers, onApplySuggestion, started, hideName = false }) {
  const { user } = useAuth();
  const { refreshPlan } = useWorkout();
  const toast = useToast();
  const [suggestion, setSuggestion] = useState(null);
  const [plateau, setPlateau] = useState(null);
  const [discomfort, setDiscomfort] = useState(null);
  const [substituting, setSubstituting] = useState(false);
  const setCount = parseInt(ex.series, 10);

  useEffect(() => {
    if (!user || !open || !setCount) return;
    let cancelled = false;
    const suggested = fetchProgressionSuggestion(user.id, ex.nome, ex.reps)
      .then(s => { if (!cancelled) setSuggestion(s); return s; })
      .catch(err => { console.error('fetchProgressionSuggestion:', err); return null; });
    const stuck = fetchPlateauStatus(user.id, ex.nome, ex.reps)
      .then(p => { if (!cancelled) setPlateau(p); return p; })
      .catch(err => { console.error('fetchPlateauStatus:', err); return null; });
    // No modo ao vivo (hideName) o treinador por voz também fala a sugestão,
    // logo depois de apresentar o exercício — só antes da primeira série (num
    // bi-set o bloco remonta a cada volta, e a sugestão não precisa se repetir).
    if (hideName && localStorage.getItem(`set_${ex.nome}_1_done`) !== 'true') {
      Promise.all([suggested, stuck]).then(([s, p]) => { if (!cancelled) coachSuggest(s, p); });
    }
    // Duplica a mesma consulta que o DiscomfortPanel já faz internamente —
    // aqui só precisamos saber se dá pra mostrar o botão de troca de exercício,
    // sem acoplar os dois componentes.
    fetchRecentDiscomfort(user.id, ex.nome)
      .then(d => { if (!cancelled) setDiscomfort(d); })
      .catch(err => console.error('fetchRecentDiscomfort:', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open, setCount, ex.nome, ex.reps, hideName]);

  if (!setCount) {
    return (
      <div className="ex-block">
        <div className="ex-block__header">
          <div className="ex-block__titles">
            <span className="ex-name">{tEx(ex.nome)}</span>
            <span className="ex-block__meta">{tReps(ex.reps)}</span>
          </div>
          {!hideName && <ExerciseDemo nome={ex.nome} tecnica={ex.tecnica} />}
        </div>
        {isCardioItem(ex) && <CardioRow ex={ex} day={day} bump={bump} started={started} />}
      </div>
    );
  }

  const alternative = getSaferAlternative(ex.nome);
  const showSwap = discomfort && ['forte', 'lesao'].includes(discomfort.severity) && alternative;

  async function handleSubstitute() {
    if (!ex.id || !alternative || substituting) return;
    setSubstituting(true);
    try {
      await substituteExercise(ex.id, {
        nome: alternative.nome, series: ex.series, reps: ex.reps,
        descanso: ex.descanso, tecnica: alternative.tecnica,
      });
      logExerciseSwap(ex.nome, alternative.nome, 'dor');
      toast(t('🔄 Trocado por {nome}', { nome: tEx(alternative.nome) }));
      await refreshPlan();
    } catch (err) {
      console.error('substituteExercise:', err);
      toast(t('⚠️ Erro ao trocar o exercício'));
    } finally {
      setSubstituting(false);
    }
  }

  const allDone = allSetsDone(ex, setCount);
  // Aquecimento: carga de trabalho = a digitada na Série 1, senão a sugerida.
  const warmups = warmupCount(ex, day.exercicios.findIndex(e => e.nome === ex.nome));
  const workKg = localStorage.getItem(`set_${ex.nome}_1_carga`) || plateau?.suggestedDeload || suggestion?.suggestedCarga || null;
  // Troca geral só pros exercícios de força do plano (não o pós-treino) que têm id.
  const canSwap = !!user && !!ex.id && day.exercicios.some(e => e.nome === ex.nome);
  return (
    <div className="ex-block">
      <div className="ex-block__header">
        <div className="ex-block__titles">
          {!hideName && (
            <>
              <span className="ex-name">{tEx(ex.nome)}</span>
              <span className="ex-block__meta">{t('{reps} reps · desc. {descanso}', { reps: tReps(ex.reps), descanso: ex.descanso })}</span>
              <ExerciseDemo nome={ex.nome} tecnica={ex.tecnica} />
            </>
          )}
          {plateau ? (
            <p className="ex-block__suggestion ex-block__suggestion--plateau">
              {t('⚠️ Estagnado há')} {plateau.sessionsStuck} {t('treinos em')} {plateau.lastCarga}kg
              {' '}<span className="ex-block__suggestion-hint">{t('— tente um deload pra {suggestedDeload}kg ou troque o exercício', { suggestedDeload: plateau.suggestedDeload })}</span>
              {' '}<button type="button" className="ex-block__apply-btn" disabled={!started} onClick={() => onApplySuggestion(plateau.suggestedDeload, null)}>{t('🎯 Usar sugestão')}</button>
            </p>
          ) : suggestion && (
            <p className="ex-block__suggestion">
              {suggestion.suggestedReps
                ? <>{t('💡 Sugestão: repita {suggestedCarga}kg, mas tente {suggestedReps} reps', { suggestedCarga: suggestion.suggestedCarga, suggestedReps: suggestion.suggestedReps })}</>
                : <>{t('💡 Sugestão: {suggestedCarga}kg', { suggestedCarga: suggestion.suggestedCarga })}</>}
              {' '}<span className="ex-block__suggestion-hint">{t('(última vez: {lastCarga}kg × {lastReps} reps)', { lastCarga: suggestion.lastCarga, lastReps: suggestion.lastReps })}</span>
              {' '}<button type="button" className="ex-block__apply-btn" disabled={!started} onClick={() => onApplySuggestion(suggestion.suggestedCarga, suggestion.suggestedReps)}>{t('🎯 Usar sugestão')}</button>
            </p>
          )}
        </div>
        <button
          type="button"
          className={`ex-block__mark-all${allDone ? ' ex-block__mark-all--done' : ''}`}
          disabled={!started} title={started ? undefined : t('Inicie o treino para registrar as séries')}
          onClick={onToggleAll}
        >
          {allDone ? t('✓ Todas') : t('Marcar todas')}
        </button>
      </div>

      {warmups > 0 && <WarmupSets key={`warm-${version}`} ex={ex} day={day} count={warmups} workKg={workKg} started={started} />}

      <div className="ex-block__sets">
        {Array.from({ length: setCount }, (_, i) => i + 1).map(n => (
          <SetRow key={`${n}-${version}`} ex={ex} n={n} day={day} bump={bump} onRestStart={onRestStart} onSetDone={onSetDone} onFillOthers={onFillOthers} started={started} />
        ))}
      </div>

      {user && <DiscomfortPanel userId={user.id} exerciseName={ex.nome} toast={toast} />}
      {showSwap && (
        <button type="button" className="ex-block__swap-btn" disabled={substituting} onClick={handleSubstitute}>
          {substituting ? t('Trocando…') : t('🔄 Trocar por: {nome}', { nome: tEx(alternative.nome) })}
        </button>
      )}
      {canSwap && <ExerciseSwap ex={ex} day={day} user={user} toast={toast} onSwapped={refreshPlan} />}
    </div>
  );
}
