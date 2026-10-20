import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Loading from './Loading';
import { MIN_CLIENTS_FOR_RANK, fetchTrainerResults, rankTrainers } from '../lib/trainers';

const fmtPct = v => (v == null ? '—' : `${v}%`);

// Pessoas → Personais: ranking pelo que os alunos conseguem (não pelo número
// de alunos). `trainers` = linhas de admin_list_trainers (nome e id).
export default function TrainerResultsCard({ trainers, days }) {
  const [state, setState] = useState({ loading: true, data: {}, error: '' });

  useEffect(() => {
    let active = true;
    setState(s => ({ ...s, loading: true }));
    fetchTrainerResults(days || 30)
      .then(data => { if (active) setState({ loading: false, data, error: '' }); })
      .catch(err => { if (active) setState({ loading: false, data: {}, error: err.message }); });
    return () => { active = false; };
  }, [days]);

  const list = rankTrainers((trainers || []).map(t => ({
    id: t.tc_user, name: t.tc_name, ...(state.data[t.tc_user] || { clients: 0 }),
  })));
  const noPlan = list.reduce((a, t) => a + (t.noPlan || 0), 0);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 className="section-title">Ranking por resultado dos alunos</h2>
      {state.loading ? <Loading /> : state.error ? <p className="form-msg form-msg--error">{state.error}</p> : (
        <>
          {noPlan > 0 && (
            <p className="card-note" style={{ margin: '0 0 8px' }}>
              <strong>{noPlan}</strong> aluno(s) vinculado(s) estão sem plano ativo ou com o plano vencido — veja a coluna “Sem plano”.
            </p>
          )}
          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr>
                  <th>#</th><th>Personal</th><th>Alunos</th><th>Treinando (14 dias)</th><th>Dias/semana</th><th>Bateram recorde</th>
                  <th>Retenção (30+ dias)</th><th>Aulas com treino</th><th>Sem plano</th>
                </tr>
              </thead>
              <tbody>
                {list.map(t => (
                  <tr key={t.id}>
                    <td data-label="#">{t.position ?? '—'}</td>
                    <td data-label="Personal"><Link to={`/users/${t.id}`}>{t.name}</Link></td>
                    <td data-label="Alunos">{t.clients}</td>
                    <td data-label="Treinando (14 dias)">{fmtPct(t.activePct)}</td>
                    <td data-label="Dias/semana">{t.daysPerWeek ?? '—'}</td>
                    <td data-label="Bateram recorde">{t.clients ? `${t.prClients} (${fmtPct(t.prPct)})` : '—'}</td>
                    <td data-label="Retenção (30+ dias)">{t.old ? `${fmtPct(t.retentionPct)} de ${t.old}` : '—'}</td>
                    <td data-label="Aulas com treino">{t.apptPast ? `${fmtPct(t.attendancePct)} de ${t.apptPast}` : '—'}</td>
                    <td data-label="Sem plano">{t.noPlan ? <span className="badge badge--warning">{t.noPlan}</span> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="card-note">
            Ordem: % de alunos que treinaram nos últimos 14 dias, depois dias de treino por semana e % que bateu recorde de
            carga no período. Só personais com {MIN_CLIENTS_FOR_RANK}+ alunos entram no ranking. Retenção = vinculados há 30+
            dias que seguem treinando. “Aulas com treino” = aulas confirmadas do período em que o aluno registrou treino no dia
            (o app não tem marcação de presença). Sem plano = sem plano ativo ou com o plano vencido.
          </p>
        </>
      )}
    </div>
  );
}
