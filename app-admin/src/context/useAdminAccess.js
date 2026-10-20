import { createContext, useContext } from 'react';

// Permissões do admin logado (ver AdminAccessProvider.jsx). Sem provider
// (testes de páginas soltas), tudo liberado.
export const AdminAccessContext = createContext({ role: null, extraAreas: [], hiddenScreens: [], loaded: false });

export function useAdminAccess() {
  return useContext(AdminAccessContext);
}
