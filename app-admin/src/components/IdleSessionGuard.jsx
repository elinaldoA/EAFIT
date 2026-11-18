import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../lib/useDialogFocus';
import { useAdminAuth } from '../context/useAdminAuth';
import {
  IDLE_MS, WARN_MS, idleState, readLastActivity, writeLastActivity,
} from '../lib/idleSession';

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
// Gravar a cada movimento seria barulho: no máximo uma vez a cada 5 s.
const WRITE_EVERY_MS = 5000;

// Encerra a sessão depois de IDLE_MS sem uso e avisa nos últimos WARN_MS.
export default function IdleSessionGuard({ idleMs = IDLE_MS, warnMs = WARN_MS }) {
  const { logout } = useAdminAuth();
  const [warning, setWarning] = useState(null);
  const lastWrite = useRef(0);
  const loggedOut = useRef(false);
  const boxRef = useRef(null);
  useDialogFocus(boxRef, warning !== null);

  useEffect(() => {
    writeLastActivity();
    lastWrite.current = Date.now();

    function touch() {
      const now = Date.now();
      // Qualquer toque ou tecla renova a sessão (e some o aviso no próximo tick).
      if (now - lastWrite.current < WRITE_EVERY_MS) return;
      lastWrite.current = now;
      writeLastActivity(now);
    }

    function tick() {
      const s = idleState(readLastActivity(), Date.now(), idleMs, warnMs);
      if (s.status === 'expired') {
        if (!loggedOut.current) { loggedOut.current = true; logout(); }
        return;
      }
      setWarning(s.status === 'warning' ? s.secondsLeft : null);
    }

    EVENTS.forEach(e => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener('visibilitychange', tick);
    const timer = setInterval(tick, 1000);
    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', tick);
      clearInterval(timer);
    };
  }, [idleMs, warnMs, logout]);

  if (warning === null) return null;
  return (
    <div className="idle-warning" role="alertdialog" aria-modal="true" aria-labelledby="idle-warning-title">
      <div className="idle-warning__box" ref={boxRef}>
        <h2 id="idle-warning-title" className="section-title">Sessão prestes a expirar</h2>
        <p>Por segurança, você será desconectado em <strong>{warning} s</strong> por falta de atividade.</p>
        <div className="actions-row">
          <button className="btn btn--primary" autoFocus onClick={() => { lastWrite.current = Date.now(); writeLastActivity(); setWarning(null); }}>
            Continuar conectado
          </button>
          <button className="btn" onClick={logout}>Sair agora</button>
        </div>
      </div>
    </div>
  );
}
