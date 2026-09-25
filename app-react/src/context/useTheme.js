import { createContext, useContext } from 'react';

// Context + hook ficam fora de ThemeContext.jsx (que só exporta o
// ThemeProvider) pra o Fast Refresh do Vite conseguir atualizar o provider
// sem recarregar a página — arquivo .jsx que exporta componente e não-componente
// juntos perde o hot reload (regra react/only-export-components do oxlint).
export const ThemeContext = createContext(null);

export function useTheme() {
  return useContext(ThemeContext);
}
