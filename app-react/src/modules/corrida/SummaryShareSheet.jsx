import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../../lib/modalRoot';
import { useToast } from '../../context/useToast';
import { useBackToClose } from '../../hooks/useBackToClose';
import { renderRunSummaryCard, shareRunSummary, renderRunYearCard, shareRunYear } from './runShareCard';
import { recapYear, yearRecap } from './runYear';
import { periodSummary, SUMMARY_PERIODS } from './runSummary';
import { t } from '../../lib/i18n';

const LABEL = { week: () => t('Semana'), month: () => t('Mês'), year: () => t('Ano'), retro: () => t('🎞️ Retrospectiva') };

// Cartão de resumo da semana, do mês ou do ano para os stories, com a meta de
// km do período e a comparação com o período anterior. `goals`: { week, month, year } em km.
export default function SummaryShareSheet({ runs, today, goals = {}, onClose }) {
  useBackToClose(onClose);
  const toast = useToast();
  const year = recapYear(runs, today);
  const recap = useMemo(() => (year ? yearRecap(runs, year) : null), [runs, year]);
  const available = [...SUMMARY_PERIODS.filter(p => periodSummary(runs, today, p)), ...(recap ? ['retro'] : [])];
  const [period, setPeriod] = useState(available.includes('month') ? 'month' : available[0] || 'month');
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [sharing, setSharing] = useState(false);
  const blobRef = useRef(null);
  const retro = period === 'retro';
  const goalKm = retro ? null : goals[period] || null;

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  useEffect(() => {
    let active = true;
    let url = '';
    setBusy(true);
    (retro ? renderRunYearCard(recap) : renderRunSummaryCard(runs, today, undefined, goalKm, { period }))
      .then(blob => {
        if (!active || !blob) return;
        blobRef.current = blob;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch(err => { console.error('SummaryShareSheet render:', err); toast(t('⚠️ Erro ao gerar imagem de compartilhamento')); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [runs, today, goalKm, period, retro, recap, toast]);

  async function handleShare() {
    if (!blobRef.current || sharing) return;
    setSharing(true);
    try {
      const result = retro
        ? await shareRunYear(recap, blobRef.current)
        : await shareRunSummary(runs, today, blobRef.current, goalKm, { period });
      if (result === 'downloaded') toast(t('🖼️ Imagem baixada'));
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('SummaryShareSheet share:', err);
        toast(t('⚠️ Erro ao gerar imagem de compartilhamento'));
      }
    } finally {
      setSharing(false);
    }
  }

  return createPortal(
    <div className="summary-modal" role="dialog" aria-modal="true" aria-label={t('Resumo para os stories')}>
      <div className="summary-modal__backdrop" onClick={onClose} />
      <div className="summary-modal__panel">
        <div className="summary-modal__header">
          <div>
            <h2 className="summary-modal__title">{t('📊 Meu resumo')}</h2>
            <p className="summary-modal__subtitle">{t('Semana, mês, ano ou a retrospectiva, com a comparação do período anterior')}</p>
          </div>
          <button type="button" className="summary-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>

        <div className="summary-modal__body">
          {previewUrl && <img className="photo-share__preview" src={previewUrl} alt={t('Prévia do resumo')} />}
          {busy && <p className="card-note" role="status">{t('Gerando imagem…')}</p>}
          <div className="summary-section">
            <div className="summary-section__title">{t('Período')}</div>
            <div className="photo-share__toggles">
              {available.map(p => (
                <button
                  key={p} type="button" aria-pressed={period === p}
                  className={`btn btn--sm ${period === p ? 'btn--primary' : 'btn--outline'}`}
                  onClick={() => setPeriod(p)}
                >{LABEL[p]()}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="summary-modal__footer">
          <button type="button" className="btn btn--primary btn--full" disabled={!previewUrl || busy || sharing} onClick={handleShare}>
            {sharing ? t('Gerando imagem…') : t('📤 Compartilhar')}
          </button>
          <button type="button" className="btn btn--outline btn--full" onClick={onClose}>{t('Fechar')}</button>
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}
