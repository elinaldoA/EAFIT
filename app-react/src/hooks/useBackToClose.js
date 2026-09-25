import { useEffect, useRef } from 'react';

// Faz o botão/gesto "voltar" (Android, navegador) fechar o modal aberto em vez
// de sair do app. Cada modal empilha uma entrada no histórico ao montar; o
// popstate fecha só o modal do topo — com modais aninhados (ex.: RatingModal
// por cima do WorkoutSummaryModal), um "voltar" fecha um de cada vez.
//
// Quando o modal é fechado pela própria UI (✕, backdrop, timer), a entrada
// que ele empilhou ainda está no histórico: o cleanup desfaz com
// history.back() e marca o popstate resultante pra ser ignorado.
const stack = [];
let ignorePops = 0;
let listening = false;

function handlePopState() {
  if (ignorePops > 0) {
    ignorePops -= 1;
    return;
  }
  const top = stack.pop();
  if (top) top.onCloseRef.current();
}

export function useBackToClose(onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!listening) {
      window.addEventListener('popstate', handlePopState);
      listening = true;
    }
    const entry = { onCloseRef };
    stack.push(entry);
    window.history.pushState({ eafitModal: true }, '');

    return () => {
      const idx = stack.indexOf(entry);
      if (idx === -1) return; // já saiu da pilha: foi fechado pelo "voltar"
      stack.splice(idx, 1);
      ignorePops += 1;
      window.history.back();
    };
  }, []);
}
