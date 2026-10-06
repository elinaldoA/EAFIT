import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { todayDate } from '../data/treinoData';
import { activePause, endPauseFields, formatDayBR } from '../lib/pause';

// Faixa no topo do Treino enquanto o modo pausa está ativo.
export default function PauseBanner() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const meta = user?.user_metadata || {};
  const active = activePause(meta, todayDate());
  if (!active) return null;

  async function handleResume() {
    setBusy(true);
    const { error } = await updateProfile(endPauseFields(meta, todayDate()));
    setBusy(false);
    toast(error ? `❌ ${error.message}` : '▶️ Pausa encerrada. Bom treino!');
  }

  return (
    <div className="pause-banner" role="status">
      <span>⏸ Modo pausa até {formatDayBR(active.to)} — sua sequência está protegida.</span>
      <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleResume}>Retomar</button>
    </div>
  );
}
