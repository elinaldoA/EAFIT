import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { RATING_OPTIONS } from '../lib/ratingOptions';

export default function RatingModal({ value, onSelect, onClose }) {
  return createPortal(
    <div className="rating-modal" role="dialog" aria-modal="true">
      <div className="rating-modal__backdrop" onClick={onClose} />
      <div className="rating-modal__panel">
        <div className="rating-modal__header">
          <h3 className="rating-modal__title">Como foi esse treino?</h3>
          <button type="button" className="rating-modal__close" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        <div className="rating-modal__options">
          {RATING_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`rating-modal__option${value === opt.value ? ' rating-modal__option--selected' : ''}`}
              aria-pressed={value === opt.value}
              onClick={() => onSelect(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}
