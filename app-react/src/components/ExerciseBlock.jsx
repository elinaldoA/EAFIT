import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { fetchProgressionSuggestion, fetchPlateauStatus } from '../lib/records';
import { fetchRecentDiscomfort } from '../lib/discomfort';
import { substituteExercise } from '../lib/workoutPlans';
import { getSaferAlternative } from '../data/workoutTemplates';
import { allSetsDone } from '../lib/workoutSets';
import { DiscomfortPanel } from './DiscomfortWidgets';
import { isCardioItem } from '../lib/cardio';
import SetRow from './SetRow';
import CardioRow from './CardioRow';
import ExerciseDemo from './ExerciseDemo';
import ExerciseSwap from './ExerciseSwap';

import { t } from '../lib/i18n';
// hideName: o modo treino ao vivo já mostra nome/meta do exercício em
// destaque no próprio cabeçalho, então o bloco omite os dele.
export default function ExerciseBlock({ ex, day, bump, onRestStart, open, version, onToggleAll, onFillOthers, onApplySuggestion, started, hideName = false }) {
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
    fetchProgressionSuggestion(user.id, ex.nome, ex.reps)
      .then(s => { if (!cancelled) setSuggestion(s); })
      .catch(err => console.error('fetchProgressionSuggestion:', err));
    fetchPlateauStatus(user.id, ex.nome, ex.reps)
      .then(p => { if (!cancelled) setPlateau(p); })
      .catch(err => console.error('fetchPlateauStatus:', err));
    // Duplica a mesma consulta que o DiscomfortPanel já faz internamente —
    // aqui só precisamos saber se dá pra mostrar o botão de troca de exercício,
    // sem acoplar os dois componentes.
    fetchRecentDiscomfort(user.id, ex.nome)
      .then(d => { if (!cancelled) setDiscomfort(d); })
      .catch(err => console.error('fetchRecentDiscomfort:', err));
    return () => { cancelled = true; };
  }, [user, open, setCount, ex.nome, ex.reps]);

  if (!setCount) {
    return (
      <div className="ex-block">
        <div className="ex-block__header">
          <div className="ex-block__titles">
            <span className="ex-name">{ex.nome}</span>
            <span className="ex-block__meta">{ex.reps}</span>
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
      toast(t('🔄 Trocado por {nome}', { nome: alternative.nome }));
      await refreshPlan();
    } catch (err) {
      console.error('substituteExercise:', err);
      toast(t('⚠️ Erro ao trocar o exercício'));
    } finally {
      setSubstituting(false);
    }
  }

  const allDone = allSetsDone(ex, setCount);
  // Troca geral só pros exercícios de força do plano (não o pós-treino) que têm id.
  const canSwap = !!user && !!ex.id && day.exercicios.some(e => e.nome === ex.nome);
  return (
    <div className="ex-block">
      <div className="ex-block__header">
        <div className="ex-block__titles">
          {!hideName && (
            <>
              <span className="ex-name">{ex.nome}</span>
              <span className="ex-block__meta">{t('{reps} reps · desc. {descanso}', { reps: ex.reps, descanso: ex.descanso })}</span>
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

      <div className="ex-block__sets">
        {Array.from({ length: setCount }, (_, i) => i + 1).map(n => (
          <SetRow key={`${n}-${version}`} ex={ex} n={n} day={day} bump={bump} onRestStart={onRestStart} onFillOthers={onFillOthers} started={started} />
        ))}
      </div>

      {user && <DiscomfortPanel userId={user.id} exerciseName={ex.nome} toast={toast} />}
      {showSwap && (
        <button type="button" className="ex-block__swap-btn" disabled={substituting} onClick={handleSubstitute}>
          {substituting ? t('Trocando…') : t('🔄 Trocar por: {nome}', { nome: alternative.nome })}
        </button>
      )}
      {canSwap && <ExerciseSwap ex={ex} day={day} user={user} toast={toast} onSwapped={refreshPlan} />}
    </div>
  );
}
