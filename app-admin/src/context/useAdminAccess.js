import { createContext, useContext } from 'react';
import { effectiveAreas } from '../lib/adminAccess';

// Permissões do admin logado (ver AdminAccessProvider.jsx). Sem provider
// (testes de páginas soltas), tudo liberado.
export const AdminAccessContext = createContext({ role: null, extraAreas: [], hiddenScreens: [], loaded: false });

// can(area): o admin pode escrever nessa área? Sem papel carregado (falhou,
// migration pendente, sem provider) libera, como o menu — o banco é quem barra.
export function useAdminAccess() {
  const access = useContext(AdminAccessContext);
  const can = area => !access.role || effectiveAreas(access.role, access.extraAreas).includes(area);
  return { ...access, can };
}
