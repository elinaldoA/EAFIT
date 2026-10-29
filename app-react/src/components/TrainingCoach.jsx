import { MUSCLE_LABELS } from '../data/bodyMuscleMap';
import { t, tEx, tFoco, locale } from '../lib/i18n';

const kg = n => n.toLocaleString(locale);
const muscles = list => list.map(m => MUSCLE_LABELS[m]).join(t(' e '));

function leadText(c) {
  switch (c.kind) {
    case 'low_energy': return t('Energia e sono baixos hoje. Um treino curto ainda conta para a semana.');
    case 'sore': return t('Ontem já teve bastante volume de {musculos}. Comece leve e não busque recorde nesse músculo hoje.', { musculos: muscles(c.muscles) });
    case 'deload_week': return t('{n} semanas seguidas de treino puxado. Esta é a semana leve: cerca de 60% das cargas e foco na técnica.', { n: c.weeks });
    case 'deload_plateaus': return t('{n} exercícios de hoje estão parados há 3 treinos. Vale uma semana leve, com cerca de 60% das cargas.', { n: c.count });
    case 'ready': return c.energized
      ? t('Energia alta e {n} exercício(s) prontos para subir carga. Dia de recorde.', { n: c.count })
      : t('{n} exercício(s) prontos para subir carga hoje.', { n: c.count });
    case 'done': return t('Treino de hoje feito. Agora é recuperar: proteína, água e sono.');
    case 'catchup': return t('Hoje está livre e o treino de {dia} ({foco}) ficou para trás.', { dia: t(c.day.dia), foco: tFoco(c.day.foco) });
    default: return null;
  }
}

function noteText(n) {
  switch (n.kind) {
    case 'up': return t('{nome}: suba para {carga} kg (fez {reps} reps com {antes} kg).', { nome: tEx(n.nome), carga: kg(n.suggestedCarga), reps: n.lastReps, antes: kg(n.lastCarga) });
    case 'stuck': return t('{nome}: parado em {carga} kg. Tente {deload} kg e volte a subir.', { nome: tEx(n.nome), carga: kg(n.lastCarga), deload: kg(n.suggestedDeload) });
    case 'missed_tomorrow': return t('{dia} ({foco}) ficou para trás. Dá para recuperar amanhã.', { dia: t(n.day.dia), foco: tFoco(n.day.foco) });
    case 'behind': return t('Pouco volume na semana: {musculos}.', { musculos: muscles(n.muscles) });
    default: return null;
  }
}

// Leitura do dia dentro do cartão "Treino de hoje" (ver lib/trainingCoach.js):
// uma frase, até três observações e no máximo um botão.
export default function TrainingCoach({ coach, onQuick, onCatchup }) {
  if (!coach) return null;
  const lead = leadText(coach);
  const notes = coach.notes.map(noteText).filter(Boolean);
  if (!lead && !notes.length) return null;
  return (
    <div className="train-coach">
      {lead && <p className={`coach__pace${coach.tone ? ` coach__pace--${coach.tone}` : ''}`}>{lead}</p>}
      {notes.length > 0 && (
        <ul className="train-coach__notes">
          {notes.map(text => <li key={text}>{text}</li>)}
        </ul>
      )}
      {coach.kind === 'low_energy' && coach.offerQuick && onQuick && (
        <button type="button" className="btn btn--outline btn--full" onClick={onQuick}>{t('⏱ Fazer a versão de 30 min')}</button>
      )}
      {coach.kind === 'catchup' && (
        <button type="button" className="btn btn--primary btn--full" onClick={() => onCatchup(coach.day.dia)}>
          {t('⚡ Recuperar treino de {dia}', { dia: t(coach.day.dia) })}
        </button>
      )}
    </div>
  );
}
