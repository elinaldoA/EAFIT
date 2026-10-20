import { useEffect, useState } from 'react';
import { fetchMyAccess } from '../lib/adminAccess';
import { AdminAccessContext } from './useAdminAccess';

// Carrega papel, áreas extras e telas ocultas do admin logado. Falhou
// (migration pendente, offline) = menu completo, como antes.
export default function AdminAccessProvider({ children }) {
  const [access, setAccess] = useState({ role: null, extraAreas: [], hiddenScreens: [], loaded: false });

  useEffect(() => {
    let active = true;
    fetchMyAccess()
      .then(a => { if (active) setAccess({ ...a, loaded: true }); })
      .catch(() => { if (active) setAccess(s => ({ ...s, loaded: true })); });
    return () => { active = false; };
  }, []);

  return <AdminAccessContext.Provider value={access}>{children}</AdminAccessContext.Provider>;
}
