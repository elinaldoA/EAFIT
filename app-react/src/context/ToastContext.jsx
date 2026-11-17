import { useCallback, useRef, useState } from 'react';
import { ToastContext } from './useToast';

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const [action, setAction] = useState(null);
  const timerRef = useRef(null);

  // `opts.action` ({ label, onClick }) põe um botão no aviso (ex.: Desfazer) e
  // o deixa mais tempo na tela.
  const toast = useCallback((msg, ms = 2600, opts) => {
    const act = opts?.action || null;
    if (act && ms === 2600) ms = 6000;
    setAction(act);
    setMessage(msg);
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), ms);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toast" className={`toast${visible ? ' show' : ''}${action ? ' toast--action' : ''}`} role="status" aria-live="polite">
        {message}
        {action && (
          <button type="button" className="toast__action" onClick={() => { setVisible(false); action.onClick(); }}>
            {action.label}
          </button>
        )}
      </div>
    </ToastContext.Provider>
  );
}
