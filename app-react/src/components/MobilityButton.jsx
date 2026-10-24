import { useState } from 'react';
import { buildMobilityRoutine, routineSeconds, isMobilityDone } from '../lib/mobility';
import MobilitySession from './MobilitySession';

import { t } from '../lib/i18n';

const LABELS = {
  pre: () => t('🔥 Mobilidade pré-treino'),
  pos: () => t('🧘 Alongamento pós-treino'),
  rest: () => t('🧘 Alongamento do dia'),
};

// Botão que monta a rotina na hora (músculos do dia) e abre a sessão guiada.
// kind: 'pre' | 'pos' | 'rest' (dia de descanso: corpo todo, mais longo).
export default function MobilityButton({ kind, muscles, minutes, className = 'btn btn--ghost btn--sm' }) {
  const [moves, setMoves] = useState(null);
  const phase = kind === 'pre' ? 'pre' : 'pos';
  const routine = buildMobilityRoutine(kind === 'rest' ? null : muscles, phase, minutes);
  const min = Math.max(1, Math.round(routineSeconds(routine) / 60));
  const done = isMobilityDone(phase);

  return (
    <>
      <button type="button" className={className} onClick={() => setMoves(routine)}>
        {LABELS[kind]()} · {done ? t('feito ✓') : t('{m} min', { m: min })}
      </button>
      {moves && (
        <MobilitySession
          moves={moves} phase={phase}
          title={LABELS[kind]()}
          onClose={() => setMoves(null)}
        />
      )}
    </>
  );
}
