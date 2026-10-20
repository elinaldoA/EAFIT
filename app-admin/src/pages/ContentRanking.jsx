import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { downloadCsv, toCsv } from '../lib/csv';
import { ISSUE_LABELS, MIN_PLANNED, fetchContentRanking } from '../lib/contentRanking';

const PERIODS = [
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Tudo' },
];

const fmtPct = v => (v == null ? '—' : `${v}%`);

function RankTable({ title, rows, cols, empty, note }) {
  return (
    <div className="card">
      <h2 className="section-title">{title}</h2>
      {rows.length === 0 ? <p className="card-note" style={{ marginTop: 0 }}>{empty}</p> : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Exercício</th>{cols.map(c => <th key={c.label}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name}>
                  <td data-label="Exercício">{r.name}</td>
                  {cols.map(c => <td key={c.label} data-label={c.label}>{c.value(r)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {note && <p className="card-note">{note}</p>}
    </div>
  );
}

const ISSUE_FILTERS = [{ key: 'all', label: 'Todas' }, ...Object.entries(ISSUE_LABELS).map(([key, label]) => ({ key, label }))];

// Conteúdo → Ranking e qualidade.
export default function ContentRanking() {
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [issue, setIssue] = useState('all');
  const [onlyInPlans, setOnlyInPlans] = useState(false);

  useEffect(() => {
    let active = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    fetchContentRanking(days)
      .then(data => { if (active) setState({ loading: false, data, error: '' }); })
      .catch(err => { if (active) setState({ loading: false, data: null, error: err.message }); });
    return () => { active = false; };
  }, [days]);

  const queue = useMemo(() => {
    const q = state.data?.quality.queue || [];
    return q.filter(i => (issue === 'all' || i.issues.includes(issue)) && (!onlyInPlans || i.inPlans > 0));
  }, [state.data, issue, onlyInPlans]);

  const { loading, data, error } = state;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ranking e qualidade</h1>
          <p className="page-subtitle">
            O que mais se faz, o que mais se pula ou troca e onde dói, os planos que as pessoas levam até o fim e o que
            falta completar na biblioteca. Contas de admin ficam de fora.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Período">
          {PERIODS.map(p => (
            <button
              key={p.days} type="button" aria-pressed={days === p.days}
              className={`seg__btn${days === p.days ? ' seg__btn--active' : ''}`}
              onClick={() => setDays(p.days)}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="two-col">
            <RankTable
              title="Mais feitos" rows={data.exercises.mostDone} empty="Nenhuma série concluída no período."
              cols={[
                { label: 'Treinos', value: r => r.done },
                { label: 'Pessoas', value: r => r.users },
                { label: 'Em planos ativos', value: r => r.inPlans },
              ]}
            />
            <RankTable
              title="Mais pulados" rows={data.exercises.mostSkipped} empty={`Nenhum exercício pulado (com ${MIN_PLANNED}+ vezes no treino).`}
              note={`Pulado = estava no treino de um dia em que a pessoa treinou e ficou sem nenhuma série. Só exercícios que apareceram ${MIN_PLANNED}+ vezes.`}
              cols={[
                { label: 'Pulado', value: r => fmtPct(r.skipPct) },
                { label: 'No treino', value: r => r.planned },
                { label: 'Em planos ativos', value: r => r.inPlans },
              ]}
            />
          </div>
          <div className="two-col">
            <RankTable
              title="Mais trocados" rows={data.exercises.mostSwapped} empty="Nenhuma troca registrada no período."
              note="Trocas feitas no app (“Trocar exercício” ou a troca sugerida depois de dor forte). Registradas a partir desta versão."
              cols={[
                { label: 'Saiu', value: r => r.swappedOut },
                { label: 'Entrou', value: r => r.swappedIn },
              ]}
            />
            <RankTable
              title="Mais relatos de dor" rows={data.exercises.mostPain} empty="Nenhum relato de dor forte ou lesão no período."
              note={<>Desconforto forte ou lesão. Detalhes em <Link to="/seguranca">Segurança</Link>.</>}
              cols={[
                { label: 'Relatos', value: r => r.pain },
                { label: 'Treinos', value: r => r.done },
              ]}
            />
          </div>

          <div className="card">
            <h2 className="section-title">Planos</h2>
            {data.plans.length === 0 ? <EmptyState icon="📋" label="Nenhum plano começado no período." /> : (
              <div className="table-wrap">
                <table className="resp-table">
                  <thead><tr><th>Plano</th><th>Planos</th><th>Pessoas</th><th>Do personal</th><th>Aderência</th><th>Terminados</th><th>Chegaram ao fim treinando</th></tr></thead>
                  <tbody>
                    {data.plans.map(p => (
                      <tr key={p.name}>
                        <td data-label="Plano">{p.name}</td>
                        <td data-label="Planos">{p.plans}</td>
                        <td data-label="Pessoas">{p.users}</td>
                        <td data-label="Do personal">{p.byTrainer}</td>
                        <td data-label="Aderência">{fmtPct(p.adherencePct)}</td>
                        <td data-label="Terminados">{p.finished}</td>
                        <td data-label="Chegaram ao fim treinando">{fmtPct(p.finishedActivePct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="card-note">
              Planos agrupados pelo nome, começados no período (no mínimo 90 dias, para dar tempo de terminar). Aderência =
              dias treinados ÷ dias de força previstos até hoje (ou até o fim do plano). “Chegaram ao fim treinando” = treinaram
              na última semana do ciclo.
            </p>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>Fila de qualidade da biblioteca</h2>
                <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
                  {data.quality.completePct}% dos {data.quality.total} exercícios sem pendência ·{' '}
                  {Object.entries(ISSUE_LABELS).map(([k, label]) => `${data.quality.counts[k]} ${label.toLowerCase()}`).join(' · ')}
                </p>
              </div>
              <div className="actions-row">
                <div className="seg" role="group" aria-label="Pendência">
                  {ISSUE_FILTERS.map(f => (
                    <button
                      key={f.key} type="button" aria-pressed={issue === f.key}
                      className={`seg__btn${issue === f.key ? ' seg__btn--active' : ''}`}
                      onClick={() => setIssue(f.key)}
                    >{f.label}</button>
                  ))}
                </div>
                <label className="actions-row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={onlyInPlans} onChange={e => setOnlyInPlans(e.target.checked)} />
                  <span>Só em planos ativos</span>
                </label>
                <button
                  type="button" className="btn btn--small" disabled={!queue.length}
                  onClick={() => downloadCsv('fila-qualidade-biblioteca.csv', toCsv(
                    queue.map(i => ({ ...i, pendencias: i.issues.map(k => ISSUE_LABELS[k]).join('; ') })),
                    [{ key: 'name', label: 'Exercicio' }, { key: 'group', label: 'Grupo' }, { key: 'type', label: 'Tipo' },
                      { key: 'inPlans', label: 'EmPlanosAtivos' }, { key: 'pendencias', label: 'Pendencias' }],
                  ))}
                >Exportar CSV</button>
              </div>
            </div>
            {queue.length === 0 ? <EmptyState icon="✨" label="Nada pendente nesse filtro." /> : (
              <div className="table-wrap">
                <table className="resp-table">
                  <thead><tr><th>Exercício</th><th>Grupo</th><th>Em planos ativos</th><th>Pendências</th><th /></tr></thead>
                  <tbody>
                    {queue.slice(0, 200).map(i => (
                      <tr key={i.name}>
                        <td data-label="Exercício">{i.name}{i.post && <div className="user-detail__meta">pós-treino</div>}</td>
                        <td data-label="Grupo">{i.group}</td>
                        <td data-label="Em planos ativos">{i.inPlans}</td>
                        <td data-label="Pendências">{i.issues.map(k => <span key={k} className="badge badge--warning" style={{ marginRight: 4 }}>{ISSUE_LABELS[k]}</span>)}</td>
                        <td data-label="">
                          <Link className="btn btn--ghost btn--small" to={i.issues.includes('no_media') ? '/demonstracoes' : '/biblioteca'}>
                            {i.issues.includes('no_media') ? 'Subir demonstração' : 'Editar'}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="card-note">
              Demonstração = mídia própria (Demonstrações) ou a padrão do app (vídeo ou quadros). Equipamento não é cobrado
              de cardio e pós-treino. Técnica curta = menos de 40 caracteres. Mostra até 200; o CSV traz todos do filtro.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
