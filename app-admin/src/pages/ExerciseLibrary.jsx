import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TIPOS, NIVEIS_MINIMOS, EMPTY_EXERCISE, toDraft, validateExercise, filterExercises,
  friendlyLibraryError, fetchLibrary, saveExercise, deleteExercise,
} from '../lib/exerciseLibrary';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const PAGE = 50;
const PROBLEMAS = [
  { value: '', label: 'Todos' },
  { value: 'dor', label: 'Com relato de dor' },
  { value: 'sem-uso', label: 'Fora de qualquer plano' },
  { value: 'sem-midia', label: 'Sem mídia própria' },
];

function ExerciseForm({ editing, groups, equipments, onCancel, onSaved }) {
  const [draft, setDraft] = useState(editing ? toDraft(editing) : { ...EMPTY_EXERCISE });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const renamed = editing && draft.nome.trim() !== editing.nome && (editing.plans_count > 0 || editing.has_media);

  function set(key, value) { setDraft(d => ({ ...d, [key]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    const { ok, errors: errs, value } = validateExercise(draft);
    setErrors(errs);
    if (!ok) return;
    if (renamed && !window.confirm(
      `Renomear "${editing.nome}" para "${value.nome}"? O histórico de carga e os recordes dos usuários são agrupados pelo nome, `
      + 'e a mídia própria também. Eles NÃO acompanham a renomeação. Continuar?',
    )) return;
    setBusy(true);
    setMsg('');
    try {
      await saveExercise(editing?.id, value);
      await onSaved();
    } catch (err) {
      setMsg(`Erro: ${friendlyLibraryError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const err = key => errors[key] && <span className="form-msg form-msg--error">{errors[key]}</span>;

  return (
    <form className="card stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
      <h2 className="section-title" style={{ margin: 0 }}>{editing ? `Editar: ${editing.nome}` : 'Novo exercício'}</h2>

      <div className="form-grid">
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field__label">Nome (igual ao que aparece nos planos)</span>
          <input className="input" value={draft.nome} onChange={e => set('nome', e.target.value)} />
          {err('nome')}
        </label>
        <label className="field">
          <span className="field__label">Grupo muscular</span>
          <input className="input" list="lib-groups" value={draft.grupo_muscular} onChange={e => set('grupo_muscular', e.target.value)} />
          {err('grupo_muscular')}
        </label>
        <label className="field">
          <span className="field__label">Equipamento</span>
          <input className="input" list="lib-equipments" value={draft.equipamento} onChange={e => set('equipamento', e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Tipo</span>
          <select className="input" value={draft.tipo} onChange={e => set('tipo', e.target.value)}>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Nível mínimo</span>
          <select className="input" value={draft.nivel_minimo} onChange={e => set('nivel_minimo', e.target.value)}>
            {NIVEIS_MINIMOS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Séries</span>
          <input className="input" value={draft.series} onChange={e => set('series', e.target.value)} />
          {err('series')}
        </label>
        <label className="field">
          <span className="field__label">Repetições</span>
          <input className="input" value={draft.reps} onChange={e => set('reps', e.target.value)} />
          {err('reps')}
        </label>
        <label className="field">
          <span className="field__label">Descanso</span>
          <input className="input" value={draft.descanso} onChange={e => set('descanso', e.target.value)} />
          {err('descanso')}
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field__label">Técnica / observação</span>
          <input className="input" value={draft.tecnica} onChange={e => set('tecnica', e.target.value)} />
        </label>
      </div>

      <label className="switch-row">
        <input type="checkbox" checked={draft.is_post_workout} onChange={e => set('is_post_workout', e.target.checked)} />
        <span>Exercício de pós-treino (core/cardio). Não entra no sorteio dos treinos de força.</span>
      </label>

      <datalist id="lib-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
      <datalist id="lib-equipments">{equipments.map(g => <option key={g} value={g} />)}</datalist>

      {renamed && (
        <p className="form-msg form-msg--error">
          Atenção: este exercício está em {editing.plans_count} plano(s){editing.has_media ? ' e tem mídia própria' : ''}. Renomear separa o histórico dos usuários.
        </p>
      )}
      {msg && <p className="form-msg form-msg--error">{msg}</p>}

      <div className="actions-row">
        <button className="btn btn--primary btn--small" type="submit" disabled={busy}>{editing ? 'Salvar' : 'Criar exercício'}</button>
        <button className="btn btn--ghost btn--small" type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default function ExerciseLibrary() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(null); // null | { editing: row | null }
  const [filters, setFilters] = useState({ search: '', grupo: '', tipo: '', nivel: '', problema: '' });
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      setRows(await fetchLibrary());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => [...new Set(rows.map(r => r.grupo_muscular))].sort(), [rows]);
  const equipments = useMemo(() => [...new Set(rows.map(r => r.equipamento).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => filterExercises(rows, filters), [rows, filters]);

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }));
    setShown(PAGE);
  }

  async function handleDelete(row) {
    const warn = row.plans_count > 0 ? ` Ele está em ${row.plans_count} plano(s) de usuários (os planos existentes não mudam).` : '';
    if (!window.confirm(`Excluir "${row.nome}" da biblioteca?${warn} Ele deixa de ser sorteado nos treinos gerados.`)) return;
    setMsg('');
    try {
      await deleteExercise(row.id);
      setMsg(`"${row.nome}" excluído.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${friendlyLibraryError(err)}`);
    }
  }

  async function handleSaved() {
    setForm(null);
    setMsg('Salvo.');
    await load();
  }

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Biblioteca de exercícios</h1>
          <p className="page-subtitle">
            Exercícios sorteados na geração automática de treinos. {rows.length} no total. A mídia de demonstração de cada um
            é enviada em <Link to="/demonstracoes">Demonstrações</Link>.
          </p>
        </div>
        <button className="btn btn--primary btn--small" onClick={() => { setForm({ editing: null }); setMsg(''); }}>Novo exercício</button>
      </div>

      {form && (
        <ExerciseForm
          key={form.editing?.id || 'new'}
          editing={form.editing} groups={groups} equipments={equipments}
          onCancel={() => setForm(null)} onSaved={handleSaved}
        />
      )}

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      <div className="actions-row">
        <input className="input search-input" placeholder="Buscar por nome…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
        <select className="input" value={filters.grupo} onChange={e => setFilter('grupo', e.target.value)} aria-label="Grupo muscular">
          <option value="">Todos os grupos</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="input" value={filters.tipo} onChange={e => setFilter('tipo', e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="input" value={filters.nivel} onChange={e => setFilter('nivel', e.target.value)} aria-label="Nível mínimo">
          <option value="">Todos os níveis</option>
          {NIVEIS_MINIMOS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
        </select>
        <select className="input" value={filters.problema} onChange={e => setFilter('problema', e.target.value)} aria-label="Situação">
          {PROBLEMAS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div className="card">
        {!filtered.length ? (
          <EmptyState icon="🏋️" label="Nenhum exercício com esses filtros." />
        ) : (
          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr><th>Exercício</th><th>Grupo</th><th>Tipo · nível</th><th>Prescrição</th><th>Mídia</th><th>Em planos</th><th>Relatos de dor</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map(r => (
                  <tr key={r.id}>
                    <td data-label="Exercício">
                      {r.nome}
                      <div className="user-detail__meta">{[r.equipamento, r.is_post_workout && 'pós-treino'].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td data-label="Grupo">{r.grupo_muscular}</td>
                    <td data-label="Tipo · nível">{r.tipo} · {r.nivel_minimo}</td>
                    <td data-label="Prescrição">{r.series}×{r.reps} · {r.descanso}</td>
                    <td data-label="Mídia">{r.has_media ? <span className="badge badge--ok">própria</span> : <span className="muted">padrão</span>}</td>
                    <td data-label="Em planos">{r.plans_count}</td>
                    <td data-label="Relatos de dor">
                      {r.discomfort_count > 0 ? <span className="badge badge--danger">{r.discomfort_count}</span> : '0'}
                    </td>
                    <td data-label="">
                      <div className="actions-row">
                        <button className="btn btn--small" onClick={() => { setForm({ editing: r }); setMsg(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
                        <button className="btn btn--ghost btn--small" onClick={() => handleDelete(r)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > shown && (
          <div className="actions-row" style={{ marginTop: 12 }}>
            <button className="btn btn--small" onClick={() => setShown(n => n + PAGE)}>Mostrar mais ({filtered.length - shown} restantes)</button>
          </div>
        )}
        {filtered.length > 0 && <p className="card-note">{filtered.length} exercício(s) no filtro.</p>}
      </div>
    </div>
  );
}
