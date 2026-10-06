import { useState } from 'react';
import { todayDate } from '../data/treinoData';
import { PAUSE_OPTIONS, activePause, startPauseFields, endPauseFields, formatDayBR } from '../lib/pause';

// Modo pausa (Perfil → Preferências): viagem, doença ou semana corrida sem
// perder a sequência. Detalhes do que a pausa faz em lib/pause.js.
export default function ProfilePauseSection({ user, updateProfile, toast }) {
  const [busy, setBusy] = useState(false);
  const meta = user.user_metadata || {};
  const active = activePause(meta, todayDate());

  async function save(fields, okMessage) {
    setBusy(true);
    const { error } = await updateProfile(fields);
    setBusy(false);
    toast(error ? `❌ ${error.message}` : okMessage);
  }

  const handleStart = days => save(startPauseFields(meta, todayDate(), days), `⏸ Pausa ativada por ${days} dias`);
  const handleEnd = () => save(endPauseFields(meta, todayDate()), '▶️ Pausa encerrada. Bom treino!');

  return (
    <>
      <p className="profile-field__hint">
        Viajando, doente ou numa semana corrida? Pause sem perder a sequência. Durante a pausa você não recebe
        lembretes de treino (só o de água) e os dias pausados não quebram a sua sequência.
      </p>
      {active && (
        <p className="pause-status" role="status">⏸ Pausado até <strong>{formatDayBR(active.to)}</strong></p>
      )}
      <div className="pause-options">
        {PAUSE_OPTIONS.map(days => (
          <button key={days} type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => handleStart(days)}>
            {active ? `Pausar mais ${days} dias` : `Pausar ${days} dias`}
          </button>
        ))}
      </div>
      {active && (
        <button type="button" className="btn btn--primary btn--full" disabled={busy} onClick={handleEnd}>
          ▶️ Retomar agora
        </button>
      )}
    </>
  );
}
