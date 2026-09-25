import { createContext, useContext } from 'react';

// Context + hook ficam fora de ToastContext.jsx (que só exporta o
// ToastProvider) pra o Fast Refresh do Vite conseguir atualizar o provider
// sem recarregar a página — arquivo .jsx que exporta componente e não-componente
// juntos perde o hot reload (regra react/only-export-components do oxlint).
export const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}
