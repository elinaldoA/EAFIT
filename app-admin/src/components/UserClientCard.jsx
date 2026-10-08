import { useEffect, useState } from 'react';
import { fetchUserClient, describeClient } from '../lib/behavior';

// Retrato do último acesso do usuário (sistema, navegador, versão do app…),
// útil no suporte. Sem registro ou com a consulta indisponível, não mostra nada.
export default function UserClientCard({ userId }) {
  const [client, setClient] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetchUserClient(userId).then(c => { if (active) setClient(c); }).catch(() => {});
    return () => { active = false; };
  }, [userId]);

  if (!client) return null;

  return (
    <section>
      <h2 className="section-title">Último acesso</h2>
      <div className="card form-grid">
        {describeClient(client).map(([label, value]) => (
          <div key={label} className="field">
            <span className="field__label">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
