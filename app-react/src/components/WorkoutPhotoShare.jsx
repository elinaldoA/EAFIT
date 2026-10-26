import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { fileToDataUrl, loadImage } from '../lib/imageUtils';
import { renderWorkoutPhotoCard, shareWorkoutPhoto, PHOTO_STATS } from '../lib/shareCard';
import { useToast } from '../context/useToast';
import { useBackToClose } from '../hooks/useBackToClose';

import { t } from '../lib/i18n';
const STAT_LABELS = {
  duracao: 'Duração',
  carga: 'Carga total',
  series: 'Séries',
  exercicios: 'Exercícios',
};

// Compartilhar o treino numa foto da própria pessoa: tira a foto na hora (câmera
// frontal) ou escolhe da galeria, escolhe quais dados aparecem e compartilha.
export default function WorkoutPhotoShare({ summary, onClose }) {
  useBackToClose(onClose);
  const toast = useToast();
  const [img, setImg] = useState(null);
  const [show, setShow] = useState(() => Object.fromEntries(PHOTO_STATS.map(k => [k, true])));
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const blobRef = useRef(null);

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  // Redesenha ao trocar a foto ou os dados; o blob fica pronto antes do toque em
  // compartilhar (o share nativo precisa do gesto do usuário ainda ativo).
  useEffect(() => {
    if (!img) return undefined;
    let active = true;
    let url = '';
    setBusy(true);
    renderWorkoutPhotoCard(summary, img, show)
      .then(blob => {
        if (!active || !blob) return;
        blobRef.current = blob;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch(err => { console.error('renderWorkoutPhotoCard:', err); toast(t('⚠️ Erro ao gerar imagem de compartilhamento')); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [img, show, summary, toast]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast(t('Selecione um arquivo de imagem.'));
    try {
      setImg(await loadImage(await fileToDataUrl(file)));
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    }
  }

  async function handleShare() {
    if (!blobRef.current || sharing) return;
    setSharing(true);
    try {
      const result = await shareWorkoutPhoto(blobRef.current);
      if (result === 'downloaded') toast(t('🖼️ Imagem baixada'));
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('shareWorkoutPhoto:', err);
        toast(t('⚠️ Erro ao gerar imagem de compartilhamento'));
      }
    } finally {
      setSharing(false);
    }
  }

  return createPortal(
    <div className="summary-modal" role="dialog" aria-modal="true" aria-label={t('Foto com os dados do treino')}>
      <div className="summary-modal__backdrop" onClick={onClose} />
      <div className="summary-modal__panel">
        <div className="summary-modal__header">
          <div>
            <h2 className="summary-modal__title">{t('📸 Foto do treino')}</h2>
            <p className="summary-modal__subtitle">{t('Tire uma foto e mostre os números do treino')}</p>
          </div>
          <button type="button" className="summary-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>

        <div className="summary-modal__body">
          {previewUrl && <img className="photo-share__preview" src={previewUrl} alt={t('Prévia da foto com os dados do treino')} />}
          {!previewUrl && !busy && <p className="card-note">{t('Escolha uma foto para começar.')}</p>}
          {busy && <p className="card-note" role="status">{t('Gerando imagem…')}</p>}

          <div className="photo-share__pick">
            <label className="btn btn--primary btn--full">
              {img ? t('📷 Tirar outra foto') : t('📷 Tirar foto')}
              <input type="file" accept="image/*" capture="user" hidden onChange={handleFile} aria-label={t('Tirar foto')} />
            </label>
            <label className="btn btn--outline btn--full">
              {t('🖼️ Escolher da galeria')}
              <input type="file" accept="image/*" hidden onChange={handleFile} aria-label={t('Escolher da galeria')} />
            </label>
          </div>

          <div className="summary-section">
            <div className="summary-section__title">{t('Dados na foto')}</div>
            <div className="photo-share__toggles">
              {PHOTO_STATS.map(k => (
                <button
                  key={k} type="button" aria-pressed={show[k]}
                  className={`btn btn--sm ${show[k] ? 'btn--primary' : 'btn--outline'}`}
                  onClick={() => setShow(s => ({ ...s, [k]: !s[k] }))}
                >{t(STAT_LABELS[k])}</button>
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
