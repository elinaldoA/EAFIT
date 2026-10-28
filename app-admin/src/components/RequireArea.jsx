import { useAdminAccess } from '../context/useAdminAccess';
import { AREA_LABELS } from '../lib/adminAccess';

// Sem a área, a tela abre só para consulta: um aviso no topo e todos os
// botões e campos desabilitados (fieldset disabled). Só interface — quem barra
// a escrita de verdade é o banco.
export default function RequireArea({ area, children }) {
  const { can } = useAdminAccess();
  if (can(area)) return children;
  return (
    <>
      <p className="form-msg" role="note">
        Somente leitura: seu perfil não tem a área “{AREA_LABELS[area] || area}”.
      </p>
      <fieldset disabled style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>{children}</fieldset>
    </>
  );
}
