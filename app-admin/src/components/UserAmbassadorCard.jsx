import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchUserAmbassador, kindLabel, SOURCE_LABELS } from '../lib/ambassadors';
import { formatDate } from '../lib/userDetailHelpers';

// Ficha do usuário: por qual embaixador ou influenciador a conta chegou. Sem vínculo (ou com a
// consulta indisponível), não mostra nada.
export default function UserAmbassadorCard({ userId }) {
  const [amb, setAmb] = useState(null);

  useEffect(() => {
    let active = true;
    if (userId) fetchUserAmbassador(userId).then(a => { if (active) setAmb(a); }).catch(() => {});
    return () => { active = false; };
  }, [userId]);

  if (!amb) return null;

  return (
    <section className="card">
      <h2 className="section-title" style={{ marginTop: 0 }}>Indicação</h2>
      <p style={{ margin: 0 }}>
        Chegou pelo link do {kindLabel(amb.kind).toLowerCase()} <Link to="/embaixadores"><strong>{amb.name}</strong></Link> (<code>{amb.code}</code>)
        {' '}via {SOURCE_LABELS[amb.source] || amb.source}, em {formatDate(amb.linkedAt)}.
      </p>
    </section>
  );
}
