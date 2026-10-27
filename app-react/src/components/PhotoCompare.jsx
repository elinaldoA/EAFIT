import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { fetchWeightLogs } from '../lib/weightLog';
import { fetchMeasurements } from '../lib/bodyMeasurements';
import { buildComparison } from '../lib/photoCompare';
import { useBackToClose } from '../hooks/useBackToClose';

import { t, locale } from '../lib/i18n';
const fullDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
const num = v => String(v).replace('.', ',');
const signed = v => `${v > 0 ? '+' : ''}${num(v)}`;
const tone = diff => (diff < 0 ? 'measure-deltas__down' : diff > 0 ? 'measure-deltas__up' : '');

function PhotoPick({ label, photos, value, onChange }) {
  const photo = photos[value];
  return (
    <div className="photo-compare__side">
      <span className="photo-compare__label">{label}</span>
      <select className="input input--sm" aria-label={label} value={value} onChange={e => onChange(Number(e.target.value))}>
        {photos.map((p, i) => <option key={p.id} value={i}>{fullDate(p.photo_date)}</option>)}
      </select>
      <img className="photo-compare__img" src={photo.image_data} alt={`${label}: ${fullDate(photo.photo_date)}`} />
    </div>
  );
}

// Antes e depois: duas fotos de progresso lado a lado, com o tempo entre elas e
// a variação de peso e de medidas nas mesmas datas. photos: ordem crescente por data.
export default function PhotoCompare({ photos, userId, onClose }) {
  useBackToClose(onClose);
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const [beforeIdx, setBeforeIdx] = useState(0);
  const [afterIdx, setAfterIdx] = useState(photos.length - 1);
  const [extra, setExtra] = useState({ weightLogs: [], measurements: [] });

  useEffect(() => {
    let active = true;
    // Peso e medidas são um complemento: se falharem, a comparação das fotos segue.
    Promise.all([fetchWeightLogs(userId).catch(() => []), fetchMeasurements(userId).catch(() => [])])
      .then(([weightLogs, measurements]) => { if (active) setExtra({ weightLogs, measurements }); });
    return () => { active = false; };
  }, [userId]);

  const before = photos[beforeIdx];
  const after = photos[afterIdx];
  const result = useMemo(
    () => buildComparison({ before, after, ...extra }),
    [before, after, extra],
  );
  const inOrder = result && result.days >= 0;

  return createPortal(
    <div className="photo-modal" role="dialog" aria-modal="true" aria-label={t('Antes e depois')}>
      <div className="photo-modal__backdrop" onClick={onClose} />
      <div className="photo-modal__panel photo-compare">
        <button type="button" className="photo-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        <h2 className="photo-compare__title">{t('Antes e depois')}</h2>

        <div className="photo-compare__grid">
          <PhotoPick label={t('Antes')} photos={photos} value={beforeIdx} onChange={setBeforeIdx} />
          <PhotoPick label={t('Depois')} photos={photos} value={afterIdx} onChange={setAfterIdx} />
        </div>

        {result && (
          <div className="photo-compare__summary">
            <strong>
              {!inOrder
                ? t('A foto "Antes" é mais recente que a "Depois"')
                : result.days === 0
                  ? t('Mesmo dia')
                  : t('{n} dias entre as fotos', { n: result.days })}
            </strong>
            {inOrder && result.weight && (
              <div className="photo-compare__row">
                <span>{t('Peso')}</span>
                <span>{num(result.weight.before)} → {num(result.weight.after)} kg <strong className={tone(result.weight.diff)}>({signed(result.weight.diff)})</strong></span>
              </div>
            )}
            {inOrder && result.measures.map(m => (
              <div className="photo-compare__row" key={m.key}>
                <span>{m.label}</span>
                <span>{num(m.before)} → {num(m.after)} cm <strong className={tone(m.diff)}>({signed(m.diff)})</strong></span>
              </div>
            ))}
            {inOrder && !result.weight && result.measures.length === 0 && (
              <p className="photo-compare__hint">{t('Registre peso e medidas em datas diferentes para ver a variação entre as fotos.')}</p>
            )}
          </div>
        )}
      </div>
    </div>,
    getModalRoot()
  );
}
