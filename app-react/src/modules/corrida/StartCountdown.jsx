import { useEffect, useRef, useState } from 'react';
import { buzz } from './haptics';
import { t } from '../../lib/i18n';

export const COUNTDOWN_FROM = 3;

// Contagem 3-2-1 antes de a corrida começar: dá tempo de guardar o celular e
// se posicionar. "Começar já" pula; "Cancelar" volta sem iniciar nada.
export default function StartCountdown({ onDone, onCancel, note = '' }) {
  const [n, setN] = useState(COUNTDOWN_FROM);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (n <= 0) { buzz('km'); done.current(); return undefined; }
    buzz('resume');
    const id = setTimeout(() => setN(v => v - 1), 1000);
    return () => clearTimeout(id);
  }, [n]);

  return (
    <div className="run-countdown" role="dialog" aria-modal="true" aria-label={t('Contagem para começar a corrida')}>
      <div className="run-countdown__n" role="status" aria-live="assertive">{n > 0 ? n : t('Já!')}</div>
      {note && <p className="run-countdown__note" role="status">{note}</p>}
      <div className="run-countdown__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('Cancelar')}</button>
        <button type="button" className="btn btn--primary" onClick={() => setN(0)}>{t('Começar já')}</button>
      </div>
    </div>
  );
}
