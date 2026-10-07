import { useState } from 'react';
import { fetchSwapContext, pickAlternatives } from '../lib/exerciseSwap';
import { substituteExercise } from '../lib/workoutPlans';

import { t, tEx } from '../lib/i18n';
// "Trocar exercício": lista alternativas da biblioteca (mesmo grupo muscular e
// tipo, no nível do usuário, fora do dia e sem o que já machucou) e troca no
// plano. A prescrição (séries/reps/descanso) do dia é mantida; o histórico de
// carga de cada exercício continua separado (ver substituteExercise).
export default function ExerciseSwap({ ex, day, user, toast, onSwapped }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, known: true, options: [], error: '' });
  const [swapping, setSwapping] = useState('');

  async function handleToggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setState({ loading: true, known: true, options: [], error: '' });
    try {
      const { library, avoidNames } = await fetchSwapContext(user.id);
      const { known, options } = pickAlternatives({
        current: ex, library, nivel: user.user_metadata?.nivel,
        dayNames: [...day.exercicios, ...day.pos].map(e => e.nome), avoidNames,
      });
      setState({ loading: false, known, options, error: '' });
    } catch (err) {
      console.error('fetchSwapContext:', err);
      setState({ loading: false, known: true, options: [], error: t('Não foi possível carregar as alternativas.') });
    }
  }

  async function handlePick(option) {
    if (swapping) return;
    setSwapping(option.nome);
    try {
      await substituteExercise(ex.id, {
        nome: option.nome, series: ex.series, reps: ex.reps, descanso: ex.descanso, tecnica: option.tecnica || '',
      });
      toast(t('🔄 Trocado por {nome}', { nome: tEx(option.nome) }));
      setOpen(false);
      await onSwapped();
    } catch (err) {
      console.error('substituteExercise:', err);
      toast(t('⚠️ Erro ao trocar o exercício'));
    } finally {
      setSwapping('');
    }
  }

  return (
    <div className="ex-swap">
      <button type="button" className="ex-swap__toggle" aria-expanded={open} onClick={handleToggle}>
        {t('🔄 Trocar exercício')}
      </button>
      {open && (
        <div className="ex-swap__panel">
          {state.loading && <p className="ex-swap__hint">{t('Buscando alternativas…')}</p>}
          {state.error && <p className="ex-swap__hint">{state.error}</p>}
          {!state.loading && !state.error && !state.known && (
            <p className="ex-swap__hint">{t('Este exercício é personalizado, então não há alternativas automáticas. Edite-o no editor do seu plano.')}</p>
          )}
          {!state.loading && !state.error && state.known && state.options.length === 0 && (
            <p className="ex-swap__hint">{t('Sem alternativas para o seu nível agora.')}</p>
          )}
          {state.options.map(o => (
            <button
              key={o.nome} type="button" className="ex-swap__option"
              disabled={!!swapping} onClick={() => handlePick(o)}
            >
              <span className="ex-swap__name">{swapping === o.nome ? t('Trocando…') : tEx(o.nome)}</span>
              {o.equipamento && <span className="ex-swap__meta">{o.equipamento}</span>}
            </button>
          ))}
          {state.options.length > 0 && (
            <p className="ex-swap__hint">{t('A troca vale daqui pra frente; o histórico do exercício atual fica guardado.')}</p>
          )}
        </div>
      )}
    </div>
  );
}
