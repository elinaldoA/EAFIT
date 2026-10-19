import { useCallback, useEffect, useState } from 'react';
import { fetchInfluencerPrograms, reviewInfluencerProgram, influencerPageUrl, LEVEL_LABELS } from '../lib/ambassadors';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const FILTERS = [
  { key: 'review', label: 'Em revisão' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'rejected', label: 'Recusados' },
  { key: '', label: 'Todos' },
];

const STATUS_LABELS = { review: 'em revisão', approved: 'aprovado', rejected: 'recusado', editing: 'em edição' };

// Conteúdo → Programas de influenciadores: o influenciador monta o programa
// no app e envia; aqui a equipe confere os dias e exercícios e aprova (vai ao
// ar na página dele e na vitrine do app) ou recusa com o motivo, que aparece
// para ele. Edição de programa que já está no ar também passa por aqui — a
// versão anterior continua valendo até a aprovação.
export default function InfluencerPrograms() {
  const [filter, setFilter] = useState('review');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await fetchInfluencerPrograms(filter || null));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function handleReview(p, approve, note) {
    setMsg('');
    try {
      await reviewInfluencerProgram(p.id, approve, note);
      setMsg(approve ? `"${p.draft.name}" aprovado e no ar.` : `"${p.draft.name}" recusado. O influenciador vê o motivo no app.`);
      await load();
      return true;
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      return false;
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Programas de influenciadores</h1>
          <p className="page-subtitle">
            Programas de treino montados pelos influenciadores no app. Nada vai ao ar sem aprovação: confira séries,
            exercícios e descrição. Para tornar alguém influenciador, use Pessoas → Embaixadores.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Situação">
          {FILTERS.map(f => (
            <button
              key={f.key || 'todos'} type="button" aria-pressed={filter === f.key}
              className={`seg__btn${filter === f.key ? ' seg__btn--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <EmptyState icon="🎬" label={filter === 'review' ? 'Nenhum programa esperando revisão.' : 'Nenhum programa aqui.'} />
      )}
      {!loading && !error && rows.map(p => <ProgramCard key={p.id} p={p} onReview={handleReview} />)}
    </div>
  );
}

function ProgramCard({ p, onReview }) {
  const [note, setNote] = useState(p.reviewNote || '');
  const [busy, setBusy] = useState(false);
  const d = p.draft || {};
  const isEdit = !!p.published && p.status === 'review';

  async function run(approve) {
    if (!approve && !note.trim()) { window.alert('Escreva o motivo da recusa: ele aparece para o influenciador.'); return; }
    setBusy(true);
    await onReview(p, approve, note.trim());
    setBusy(false);
  }

  return (
    <div className="card stack">
      <div className="actions-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{d.name}</strong>{' '}
          <span className={`badge ${p.status === 'approved' ? 'badge--ok' : p.status === 'rejected' ? 'badge--warning' : ''}`}>{STATUS_LABELS[p.status] || p.status}</span>
          {p.hidden && <> <span className="badge">escondido pelo influenciador</span></>}
          <div className="user-detail__meta">
            {p.influencer} · <a href={influencerPageUrl(p.code)} target="_blank" rel="noopener noreferrer">@{p.code}</a>
            {' · '}{LEVEL_LABELS[d.level] || d.level}{d.weeks ? ` · ${d.weeks} semanas` : ' · sem prazo'}
            {' · '}atualizado em {formatDate(p.updatedAt)}
            {p.published && ` · ${p.adoptions} começaram`}
          </div>
        </div>
      </div>

      {isEdit && (
        <p className="card-note" style={{ margin: 0 }}>
          Edição de um programa que já está no ar{p.published.name !== d.name ? ` (hoje: "${p.published.name}")` : ''}. A versão atual continua valendo até você aprovar.
        </p>
      )}
      {d.description && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{d.description}</p>}

      <div className="table-wrap">
        <table className="resp-table">
          <thead><tr><th>Dia</th><th>Exercício</th><th>Séries × reps</th><th>Descanso</th><th>Bi-set</th><th>Técnica</th></tr></thead>
          <tbody>
            {(d.days || []).flatMap(day => (day.exercicios || []).map((ex, i) => (
              <tr key={`${day.dia}-${i}`}>
                <td data-label="Dia">{i === 0 ? <strong>{day.dia}{day.foco ? ` · ${day.foco}` : ''}</strong> : ''}</td>
                <td data-label="Exercício">{ex.nome}</td>
                <td data-label="Séries × reps">{ex.series} × {ex.reps}</td>
                <td data-label="Descanso">{ex.descanso || '—'}</td>
                <td data-label="Bi-set">{ex.grupo || '—'}</td>
                <td data-label="Técnica">{ex.tecnica || '—'}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {p.status === 'review' && (
        <div className="form-grid">
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span className="field__label">Motivo (obrigatório para recusar; o influenciador vê no app)</span>
            <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Ex.: o dia de pernas tem 12 séries de agachamento para iniciante — reduza o volume." />
          </label>
          <div className="form-grid__actions">
            <button className="btn btn--danger" disabled={busy} onClick={() => run(false)}>Recusar</button>
            <button className="btn btn--primary" disabled={busy} onClick={() => run(true)}>Aprovar e publicar</button>
          </div>
        </div>
      )}
      {p.status === 'rejected' && p.reviewNote && <p className="card-note" style={{ margin: 0 }}>Motivo enviado: {p.reviewNote}</p>}
    </div>
  );
}
