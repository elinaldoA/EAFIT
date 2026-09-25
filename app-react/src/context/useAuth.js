import { createContext, useContext } from 'react';

// Context + hook ficam fora de AuthContext.jsx (que só exporta o
// AuthProvider) pra o Fast Refresh do Vite conseguir atualizar o provider
// sem recarregar a página — arquivo .jsx que exporta componente e não-componente
// juntos perde o hot reload (regra react/only-export-components do oxlint).
export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}
