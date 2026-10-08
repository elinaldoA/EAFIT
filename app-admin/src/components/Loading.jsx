import { useEffect, useState } from 'react';
import DumbbellSpinner from './DumbbellSpinner';

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

// Várias telas montam mais de um overlay ao mesmo tempo (um por card). Contador
// compartilhado: se cada um guardasse o overflow "anterior", o segundo guardaria
// 'hidden' e devolveria isso ao sair, deixando a página sem scroll pra sempre.
let locks = 0;
let overflowBefore = '';

function lockScroll() {
  if (locks++ === 0) {
    overflowBefore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  return () => {
    if (--locks === 0) document.body.style.overflow = overflowBefore;
  };
}

// Tela cheia, centralizado e bloqueia toda interação (cliques, scroll, foco)
// enquanto estiver montado.
export default function Loading({ label = 'Carregando…' }) {
  const pct = useProgress();

  useEffect(lockScroll, []);

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
        <DumbbellSpinner size="lg" />
        <div className="loading-overlay__pct">{pct}%</div>
        <div className="loading-overlay__bar"><span style={{ width: `${pct}%` }} /></div>
        <div className="loading-overlay__label">{label}</div>
      </div>
    </div>
  );
}
