import { useEffect, useState } from 'react';
import { fetchUserWellbeing, scoreLevel, SCORE_BADGE } from '../lib/insights';
import { softFail } from '../lib/softFail';

const MEASURES = [
  ['cintura', 'Cintura'], ['quadril', 'Quadril'], ['peito', 'Peito'], ['braco', 'Braço'], ['coxa', 'Coxa'],
];

const day = iso => (iso ? iso.split('-').reverse().join('/') : '—');

function Score({ value }) {
  return <span className={`badge ${SCORE_BADGE[scoreLevel(value)]}`}>{value}</span>;
}

// Check-ins e medidas corporais do usuário. Sem registros (ou com a consulta
// indisponível) não mostra nada, como o cartão de último acesso.
export default function UserWellbeingCard({ userId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetchUserWellbeing(userId).then(d => { if (active) setData(d); }).catch(softFail('Usuário: bem-estar'));
    return () => { active = false; };
  }, [userId]);

  if (!data || (data.checkins.length === 0 && data.measures.length === 0)) return null;

  return (
    <>
      {data.checkins.length > 0 && (
        <section>
          <h2 className="section-title">Check-in diário</h2>
          <table className="resp-table" aria-label="Check-in diário">
            <thead><tr><th scope="col">Data</th><th scope="col">Energia</th><th scope="col">Sono</th><th scope="col">Humor</th></tr></thead>
            <tbody>
              {data.checkins.map(c => (
                <tr key={c.id}>
                  <td data-label="Data">{day(c.checkin_date)}</td>
                  <td data-label="Energia"><Score value={c.energy} /></td>
                  <td data-label="Sono"><Score value={c.sleep} /></td>
                  <td data-label="Humor"><Score value={c.mood} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.measures.length > 0 && (
        <section>
          <h2 className="section-title">Medidas corporais (cm)</h2>
          <table className="resp-table" aria-label="Medidas corporais (cm)">
            <thead><tr><th scope="col">Data</th>{MEASURES.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {data.measures.map(m => (
                <tr key={m.id}>
                  <td data-label="Data">{day(m.measured_on)}</td>
                  {MEASURES.map(([key, label]) => <td key={key} data-label={label}>{m[key] ?? '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
