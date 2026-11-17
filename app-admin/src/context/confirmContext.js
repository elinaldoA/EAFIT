import { createContext, useContext } from 'react';

// confirm({ title, message, confirmLabel, danger, requireText, reauth })
//   -> Promise<boolean>. Sem provider (testes de páginas soltas) cai no
// window.confirm, então telas migradas continuam funcionando sozinhas.
export const ConfirmContext = createContext(null);

export function useConfirm() {
  const ask = useContext(ConfirmContext);
  if (ask) return ask;
  return async ({ title, message }) =>
    window.confirm([title, message].filter(Boolean).join('\n\n'));
}
