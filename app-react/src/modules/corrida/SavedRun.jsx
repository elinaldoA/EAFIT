import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../context/useToast';
import { paceSeconds, formatPace, formatClock, formatKm } from './runs';
import { weatherText } from './weather';
import { renderRunCard, shareRunCard } from './runShareCard';
import { t } from '../../lib/i18n';

// Tela que fica depois de salvar a corrida (a corrida em andamento já acabou):
// confirma, mostra o resumo e oferece compartilhar. O compartilhamento só existe
// aqui, com a corrida já guardada.
export default function SavedRun({ record, onClose }) {
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  // O cartão é desenhado ao abrir a tela: no toque em Compartilhar ele já está
  // pronto e o share nativo não perde o gesto (lib/shareCard.js).
  const prepared = useRef(null);
  useEffect(() => {
    if (!prepared.current) prepared.current = renderRunCard(record).catch(() => null);
  }, [record]);

  async function handleShare() {
    setSharing(true);
    try {
      const result = await shareRunCard(record, prepared.current);
      if (result === 'downloaded') toast(t('🖼️ Imagem baixada'));
    } catch (err) {
      if (err?.name !== 'AbortError') toast(t('⚠️ Não foi possível gerar a imagem'));
    } finally {
      setSharing(false);
    }
  }

  const wx = weatherText(record.weather);
  return (
    <div className="run-live run-live--finish" role="dialog" aria-modal="true" aria-label={t('Corrida salva')}>
      <div className="run-live__top">
        <span className="run-live__brand">EAFIT · Run</span>
      </div>
      <h2 className="run-live__title">{t('✅ Corrida salva')}</h2>
      <div className="run-live__clock run-live__clock--small">{t('{v1} km', { v1: formatKm(record.distance_m) })}</div>
      <p className="run-live__extra">{formatClock(record.duration_s)} · {formatPace(paceSeconds(record.duration_s, record.distance_m))}/km</p>
      {wx && <p className="run-live__extra">{wx}</p>}
      <div className="run-live__actions">
        <button type="button" className="btn btn--primary run-live__btn" disabled={sharing} onClick={handleShare}>
          {sharing ? t('Gerando imagem…') : t('📤 Compartilhar')}
        </button>
        <button type="button" className="btn btn--ghost run-live__btn" onClick={onClose}>{t('Concluir')}</button>
      </div>
    </div>
  );
}
