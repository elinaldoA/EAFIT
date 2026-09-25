import { createContext, useContext } from 'react';

// Context + hook ficam fora de AdminAuthContext.jsx (que só exporta o
// AdminAuthProvider) pra o Fast Refresh do Vite conseguir atualizar o provider
// sem recarregar a página — arquivo .jsx que exporta componente e não-componente
// juntos perde o hot reload (regra react/only-export-components do oxlint).
export const AdminAuthContext = createContext(null);

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
