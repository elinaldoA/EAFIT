import { useEffect, useRef } from 'react';

// Faz o botão/gesto "voltar" (Android, navegador) fechar o modal aberto em vez
// de sair do app. Cada modal empilha uma entrada no histórico ao montar; o
// popstate fecha só o modal do topo — com modais aninhados (ex.: RatingModal
// por cima do WorkoutSummaryModal), um "voltar" fecha um de cada vez.
//
// Quando o modal é fechado pela própria UI (✕, backdrop, timer), a entrada
// que ele empilhou ainda está no histórico: o cleanup desfaz com
// history.back() e marca o popstate resultante pra ser ignorado.
//
// Esse history.back() é assíncrono. Se outro modal montar antes dele assentar
// (ex.: fechar o modo treino e abrir o resumo na sequência, ou o remount do
// StrictMode no dev) e já empilhar a entrada dele, o "voltar" pendente tira a
// entrada NOVA do histórico — e o próximo fechamento volta uma página a mais,
// saindo do app. Por isso, com um "voltar" em andamento, o pushState do modal
// novo espera o popstate dele chegar (pendingPush).
const stack = [];
const pendingPush = [];
let ignorePops = 0;
let listening = false;

function pushEntry(entry) {
  entry.pushed = true;
  window.history.pushState({ eafitModal: true }, '');
}

function handlePopState() {
  if (ignorePops > 0) {
    ignorePops -= 1;
    if (ignorePops === 0) pendingPush.splice(0).forEach(pushEntry);
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
    const entry = { onCloseRef, pushed: false };
    stack.push(entry);
    if (ignorePops > 0) pendingPush.push(entry);
    else pushEntry(entry);

    return () => {
      const idx = stack.indexOf(entry);
      if (idx === -1) return; // já saiu da pilha: foi fechado pelo "voltar"
      stack.splice(idx, 1);
      const pending = pendingPush.indexOf(entry);
      if (pending !== -1) {
        pendingPush.splice(pending, 1); // nunca chegou a empilhar: nada a desfazer
        return;
      }
      ignorePops += 1;
      window.history.back();
    };
  }, []);
}
