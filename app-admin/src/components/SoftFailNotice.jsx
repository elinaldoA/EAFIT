import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { clearSoftFailures, useSoftFailures } from '../lib/softFail';

// Faixa no topo do conteúdo quando algum dado complementar não carregou (o resto
// da tela segue funcionando). Some ao trocar de tela; "Recarregar" tenta tudo de novo.
export default function SoftFailNotice() {
  const failures = useSoftFailures();
  const { pathname } = useLocation();
  useEffect(() => { clearSoftFailures(); }, [pathname]);
  if (!failures.length) return null;
  return (
    <div className="soft-fail" role="status">
      <span>
        Alguns dados não carregaram e podem estar incompletos: {failures.map(f => f.label).join(' · ')}.
      </span>
      <span className="actions-row">
        <button type="button" className="btn btn--small" onClick={() => window.location.reload()}>Recarregar</button>
        <button type="button" className="btn btn--ghost btn--small" onClick={clearSoftFailures}>Fechar</button>
      </span>
    </div>
  );
}
