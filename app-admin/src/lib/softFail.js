import { useSyncExternalStore } from 'react';

// Falha de dado "complementar" (um cartão a mais na tela, uma contagem do menu)
// não deve derrubar a página — mas também não pode sumir sem rastro, como
// acontecia com `.catch(() => {})`. Registra no console com o nome da origem
// (aparece no relatório de quem reclama que "o cartão não carrega"), avisa na
// tela (faixa do SoftFailNotice, no topo do conteúdo) e devolve o valor reserva.
//   fetchX().then(setX).catch(softFail('Perfil: preferências'))
let failures = []; // [{ label, message }]; troca de array a cada mudança (useSyncExternalStore)
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());

export function softFail(label, fallback) {
  return err => {
    const message = err?.message || String(err || '');
    console.warn(`[painel] falha ao carregar "${label}":`, message);
    if (!failures.some(f => f.label === label)) {
      failures = [...failures, { label, message }];
      emit();
    }
    return fallback;
  };
}

// Ao trocar de tela ou fechar o aviso: o que ainda falhar volta a avisar.
export function clearSoftFailures() {
  if (!failures.length) return;
  failures = [];
  emit();
}

export function useSoftFailures() {
  return useSyncExternalStore(
    fn => { listeners.add(fn); return () => listeners.delete(fn); },
    () => failures,
    () => failures,
  );
}
