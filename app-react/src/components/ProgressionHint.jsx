import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { db } from '../lib/supabase';
import { fetchBodyweightSets, evaluateProgress, progressionOf } from '../lib/bodyweight';
import { isTimedItem } from '../lib/timedSets';
import { substituteExercise } from '../lib/workoutPlans';
import { logExerciseSwap } from '../lib/tracking';

import { t, tEx } from '../lib/i18n';
const withUnit = (v, unit) => (unit === 's' ? `${v}s` : t('{n} reps', { n: v }));

// Calistenia no bloco do exercício: em que nível da progressão ele está e, pelo
// histórico sem carga, se já dá para subir (bateu o teto do plano em todas as
// séries nas 2 últimas sessões) ou qual marca tentar hoje. Subir troca o
// exercício do plano pelo próximo degrau da cadeia, com as reps da biblioteca.
export default function ProgressionHint({ ex, setCount, open }) {
  const { user } = useAuth();
  const { refreshPlan } = useWorkout();
  const toast = useToast();
  const chain = progressionOf(ex.nome);
  const timed = isTimedItem(ex);
  const [progress, setProgress] = useState(null);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    if (!user || !open || !setCount || (!chain && !timed)) return;
    let cancelled = false;
    fetchBodyweightSets(user.id, ex.nome)
      .then(sets => { if (!cancelled) setProgress(evaluateProgress(sets, ex)); })
      .catch(err => console.error('ProgressionHint:', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open, setCount, ex.nome, ex.reps, ex.series]);

  async function handleAdvance() {
    if (!ex.id || !chain?.next || swapping) return;
    setSwapping(true);
    try {
      const { data: row, error } = await db.from('exercise_library')
        .select('nome, reps, descanso, tecnica').eq('nome', chain.next).single();
      if (error) throw error;
      await substituteExercise(ex.id, { nome: row.nome, series: ex.series, reps: row.reps, descanso: row.descanso, tecnica: row.tecnica });
      logExerciseSwap(ex.nome, row.nome, 'progressao');
      toast(t('🚀 Subiu de nível: {nome}', { nome: tEx(row.nome) }));
      await refreshPlan();
    } catch (err) {
      console.error('handleAdvance:', err);
      toast(t('⚠️ Erro ao trocar o exercício'));
    } finally {
      setSwapping(false);
    }
  }

  if (!chain && !progress) return null;
  const showTip = progress && !progress.ready && progress.tryValue > progress.lastBest;

  return (
    <div className="ex-block__progression">
      {chain && (
        <span className="ex-block__level">
          {t('{grupo} · nível {n} de {total}', { grupo: chain.chain.label, n: chain.level, total: chain.total })}
        </span>
      )}
      {progress?.ready && (
        <p className="ex-block__suggestion">
          {chain?.next
            ? t('🚀 Você bateu {meta} em todas as séries nas 2 últimas sessões. Próximo nível: {nome}', { meta: withUnit(progress.ceiling, progress.unit), nome: tEx(chain.next) })
            : t('🚀 Você bateu {meta} em todas as séries nas 2 últimas sessões. Este é o topo da progressão!', { meta: withUnit(progress.ceiling, progress.unit) })}
          {chain?.next && ex.id && (
            <>{' '}<button type="button" className="ex-block__apply-btn" disabled={swapping} onClick={handleAdvance}>
              {swapping ? t('Trocando…') : t('⬆ Subir de nível')}
            </button></>
          )}
        </p>
      )}
      {showTip && (
        <p className="ex-block__suggestion">
          {t('💡 Última vez: {a} — tente {b}', { a: withUnit(progress.lastBest, progress.unit), b: withUnit(progress.tryValue, progress.unit) })}
        </p>
      )}
    </div>
  );
}
