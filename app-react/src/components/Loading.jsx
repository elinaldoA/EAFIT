import { useEffect, useState } from 'react';
import DumbbellSpinner, { useRunSpinner } from './DumbbellSpinner';

import { t } from '../lib/i18n';
// Não há progresso real de uma requisição: a porcentagem sobe suave até 95% e
// o overlay some quando o carregamento termina (componente desmonta).
function useProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPct(p => Math.min(95, p + Math.max(1, (95 - p) * 0.08))), 120);
    return () => clearInterval(id);
  }, []);
  return Math.floor(pct);
}

// Tela cheia, centralizado e bloqueia toda interação (cliques, scroll, foco)
// enquanto estiver montado.
export default function Loading({ label = t('Carregando…') }) {
  const pct = useProgress();
  const running = useRunSpinner();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="loading-overlay"
      role="status"
      aria-busy="true"
      aria-live="polite"
      tabIndex={-1}
      ref={el => el?.focus()}
      onKeyDown={e => e.preventDefault()}
    >
      <div className="loading-overlay__box">
        {running ? (
          // Módulo Run: a barra de progresso é uma pista e o corredor avança nela.
          <div className="run-track" style={{ '--p': pct / 100 }}>
            <span className="run-track__runner"><DumbbellSpinner size="md" /></span>
            <div className="run-track__lane"><span /></div>
          </div>
        ) : <DumbbellSpinner size="lg" />}
        <div className="loading-overlay__pct">{pct}%</div>
        {!running && <div className="loading-overlay__bar"><span style={{ width: `${pct}%` }} /></div>}
        <div className="loading-overlay__label">{label}</div>
      </div>
    </div>
  );
}
