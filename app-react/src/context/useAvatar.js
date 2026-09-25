import { createContext, useContext } from 'react';

// Context + hook ficam fora de AvatarContext.jsx (que só exporta o
// AvatarProvider) pra o Fast Refresh do Vite conseguir atualizar o provider
// sem recarregar a página — arquivo .jsx que exporta componente e não-componente
// juntos perde o hot reload (regra react/only-export-components do oxlint).
export const AvatarContext = createContext(null);

export function useAvatar() {
  return useContext(AvatarContext);
}
