import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { useBackToClose } from '../hooks/useBackToClose';
import { QUICK_OPTIONS, estimateMinutes, fitDayToTime } from '../lib/quickWorkout';

import { t, tEx } from '../lib/i18n';

function ChangeLine({ change }) {
  if (change.type === 'pos') return <li>{t('Sem o pós-treino (cardio e abdômen)')}</li>;
  if (change.type === 'warmup') return <li>{t('Aquecimento com 1 série')}</li>;
  if (change.type === 'superset') {
    return <li>{t('Bi-set: {a} + {b}', { a: tEx(change.names[0]), b: tEx(change.names[1]) })}</li>;
  }
  if (change.type === 'sets') {
    return <li>{t('{nome}: {from} → {to} séries', { nome: tEx(change.nome), from: change.from, to: change.to })}</li>;
  }
  if (change.type === 'removed') {
    return <li>{t('Fica de fora: {nomes}', { nomes: change.names.map(tEx).join(', ') })}</li>;
  }
  return null;
}

// Escolha do tempo disponível hoje (ver lib/quickWorkout.js): mostra o que
// muda em cada opção antes de aplicar. day = o dia completo do plano.
export default function QuickWorkoutModal({ day, current, onChoose, onClose }) {
  useBackToClose(onClose);
  const full = estimateMinutes(day);
  const options = QUICK_OPTIONS.filter(m => m < full);
  const [minutes, setMinutes] = useState(() => current || options[options.length - 1] || null);
  const preview = minutes ? fitDayToTime(day, minutes) : null;

  return createPortal(
    <div className="rating-modal" role="dialog" aria-modal="true" aria-labelledby="quick-title">
      <div className="rating-modal__backdrop" onClick={onClose} />
      <div className="rating-modal__panel">
        <div className="rating-modal__header">
          <h3 className="rating-modal__title" id="quick-title">{t('⏱ Quanto tempo você tem?')}</h3>
          <button type="button" className="rating-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>
        <p className="app-rating__text">
          {t('O treino completo de hoje leva cerca de {min} min. Escolha o tempo e o app enxuga só o treino de hoje — o plano continua igual.', { min: full })}
        </p>

        {options.length === 0 ? (
          <p className="app-rating__text">{t('Seu treino de hoje já é curto — não há o que enxugar.')}</p>
        ) : (
          <>
            <div className="quick__options" role="radiogroup" aria-label={t('Tempo disponível')}>
              {options.map(m => (
                <button
                  key={m} type="button" role="radio" aria-checked={minutes === m}
                  className={`quick__option${minutes === m ? ' quick__option--on' : ''}`}
                  onClick={() => setMinutes(m)}
                >{t('{m} min', { m })}</button>
              ))}
            </div>
            {preview && (
              <div className="quick__preview">
                <div className="quick__preview-title">
                  {preview.minutes > minutes
                    ? t('Fica em ~{min} min — menos que isso cortaria os exercícios principais', { min: preview.minutes })
                    : t('Fica em ~{min} min', { min: preview.minutes })}
                </div>
                <ul className="quick__changes">
                  {preview.changes.map((c, i) => <ChangeLine key={i} change={c} />)}
                </ul>
                <p className="quick__note">{t('Os dois primeiros exercícios ficam inteiros. Nada que você já marcou é cortado.')}</p>
              </div>
            )}
          </>
        )}

        <div className="quick__actions">
          {current && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChoose(null)}>{t('Voltar ao treino completo')}</button>
          )}
          {minutes && options.length > 0 && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onChoose(minutes)}>
              {t('Usar versão de {m} min', { m: minutes })}
            </button>
          )}
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}
