import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { todayDate } from '../data/treinoData';
import { activePause, endPauseFields, formatDayBR } from '../lib/pause';

import { t } from '../lib/i18n';
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
    toast(error ? `❌ ${error.message}` : t('▶️ Pausa encerrada. Bom treino!'));
  }

  return (
    <div className="pause-banner" role="status">
      <span>{t('⏸ Modo pausa até {v1} — sua sequência está protegida.', { v1: formatDayBR(active.to) })}</span>
      <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleResume}>{t('Retomar')}</button>
    </div>
  );
}
