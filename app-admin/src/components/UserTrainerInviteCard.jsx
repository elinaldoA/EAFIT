import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchUserTrainerInvite } from '../lib/trainers';
import { formatDate } from '../lib/userDetailHelpers';

// Ficha do usuário: se a conta chegou pelo link de divulgação de um personal.
// Sem indicação (ou com a consulta indisponível), não mostra nada.
export default function UserTrainerInviteCard({ userId }) {
  const [inv, setInv] = useState(null);

  useEffect(() => {
    let active = true;
    if (userId) fetchUserTrainerInvite(userId).then(r => { if (active) setInv(r); }).catch(() => {});
    return () => { active = false; };
  }, [userId]);

  if (!inv) return null;

  return (
    <section className="card">
      <h2 className="section-title" style={{ marginTop: 0 }}>Indicação do personal</h2>
      <p style={{ margin: 0 }}>
        Criou a conta pelo link do personal <Link to={`/users/${inv.trainerId}`}><strong>{inv.name}</strong></Link> (<code>{inv.code}</code>),
        em {formatDate(inv.createdAt)}. {inv.client ? 'É aluno dele hoje.' : 'Não está vinculado a ele hoje.'}
      </p>
    </section>
  );
}
