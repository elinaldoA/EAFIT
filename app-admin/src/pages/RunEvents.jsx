import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EVENT_STATUS, EMPTY_EVENT, toDraft, validateEvent, filterEvents, friendlyEventError, distancesToText,
  fetchRunEventsAdmin, saveRunEvent, setEventsStatus, deleteRunEvent,
} from '../lib/runEvents';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { useConfirm } from '../context/confirmContext';

const PAGE = 50;
const dateBr = d => (d ? d.split('-').reverse().join('/') : '—');

function EventForm({ editing, onCancel, onSaved }) {
  const [draft, setDraft] = useState(editing ? toDraft(editing) : { ...EMPTY_EVENT });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const err = k => errors[k] && <span className="form-msg form-msg--error" role="alert">{errors[k]}</span>;

  async function handleSubmit(e) {
    e.preventDefault();
    const { ok, errors: errs, value } = validateEvent(draft);
    setErrors(errs);
    if (!ok) return;
    setBusy(true);
    setMsg('');
    try {
      await saveRunEvent(editing?.id, value);
      await onSaved();
    } catch (error) {
      setMsg(`Erro: ${friendlyEventError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
      <h2 className="section-title" style={{ margin: 0 }}>{editing ? `Editar: ${editing.name}` : 'Nova prova'}</h2>
      <div className="form-grid">
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field__label">Nome da prova</span>
          <input className="input" value={draft.name} maxLength={120} onChange={e => set('name', e.target.value)} />
          {err('name')}
        </label>
        <label className="field">
          <span className="field__label">Data</span>
          <input className="input" type="date" value={draft.event_date} onChange={e => set('event_date', e.target.value)} />
          {err('event_date')}
        </label>
        <label className="field">
          <span className="field__label">Distâncias em km (ex.: 5; 10; 21,1)</span>
          <input className="input" value={draft.distances} onChange={e => set('distances', e.target.value)} />
          {err('distances')}
        </label>
        <label className="field">
          <span className="field__label">Cidade</span>
          <input className="input" value={draft.city} maxLength={80} onChange={e => set('city', e.target.value)} />
          {err('city')}
        </label>
        <label className="field">
          <span className="field__label">UF</span>
          <input className="input" value={draft.state} maxLength={2} onChange={e => set('state', e.target.value.toUpperCase())} />
          {err('state')}
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field__label">Local da largada (opcional)</span>
          <input className="input" value={draft.venue} maxLength={120} onChange={e => set('venue', e.target.value)} />
          {err('venue')}
        </label>
        <label className="field">
          <span className="field__label">Latitude (opcional, ex.: -20,31550)</span>
          <input className="input" inputMode="decimal" value={draft.lat} onChange={e => set('lat', e.target.value)} />
          {err('lat')}
        </label>
        <label className="field">
          <span className="field__label">Longitude (opcional, ex.: -40,31280)</span>
          <input className="input" inputMode="decimal" value={draft.lng} onChange={e => set('lng', e.target.value)} />
          {err('lng')}
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field__label">Link do organizador (inscrição ou informações)</span>
          <input className="input" type="url" value={draft.url} onChange={e => set('url', e.target.value)} />
          {err('url')}
        </label>
      </div>
      <p className="card-note">Sem latitude e longitude, a prova só aparece para quem filtra pelo estado.</p>
      {msg && <p className="form-msg form-msg--error" role="alert">{msg}</p>}
      <div className="actions-row">
        <button className="btn btn--primary btn--small" type="submit" disabled={busy}>{editing ? 'Salvar' : 'Criar prova'}</button>
        <button className="btn btn--ghost btn--small" type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default function RunEvents() {
  const ask = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: 'draft' });
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      setRows(await fetchRunEventsAdmin());
      setError('');
    } catch (err) {
      setError(friendlyEventError(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => filterEvents(rows, filters), [rows, filters]);
  const counts = useMemo(() => rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}), [rows]);
  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setShown(PAGE); };

  async function changeStatus(list, status, label) {
    setMsg('');
    try {
      await setEventsStatus(list.map(r => r.id), status);
      setMsg(`${list.length} prova(s) ${label}.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${friendlyEventError(err)}`);
    }
  }

  async function approveAll() {
    if (!await ask(`Aprovar as ${filtered.length} provas do filtro? Elas passam a aparecer no app.`)) return;
    await changeStatus(filtered, 'approved', 'aprovada(s)');
  }

  async function handleDelete(row) {
    if (!await ask(`Excluir "${row.name}"? Uma nova importação pode trazê-la de volta como rascunho; para esconder de vez, descarte.`)) return;
    setMsg('');
    try {
      await deleteRunEvent(row.id);
      setMsg(`"${row.name}" excluída.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${friendlyEventError(err)}`);
    }
  }

  async function handleSaved() {
    setForm(null);
    setMsg('Salvo.');
    await load();
  }

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error" role="alert">{error}</p>;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Provas de corrida</h1>
          <p className="page-subtitle">
            Calendário "Próximas corridas perto de você" do EAFIT Run. As importadas chegam como rascunho: o app só mostra as aprovadas.
            {' '}{counts.draft || 0} rascunho(s), {counts.approved || 0} aprovada(s), {counts.rejected || 0} descartada(s).
          </p>
        </div>
        <button className="btn btn--primary btn--small" onClick={() => { setForm({ editing: null }); setMsg(''); }}>Nova prova</button>
      </div>

      {form && (
        <EventForm key={form.editing?.id || 'new'} editing={form.editing} onCancel={() => setForm(null)} onSaved={handleSaved} />
      )}

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`} role={msg.startsWith('Erro') ? 'alert' : 'status'}>{msg}</p>}

      <div className="actions-row">
        <input className="input search-input" placeholder="Buscar por nome ou cidade…" aria-label="Buscar por nome ou cidade…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
        <select className="input" value={filters.status} onChange={e => setFilter('status', e.target.value)} aria-label="Situação">
          <option value="">Todas</option>
          {Object.entries(EVENT_STATUS).map(([k, label]) => <option key={k} value={k}>{label}s</option>)}
        </select>
        {filters.status === 'draft' && filtered.length > 0 && (
          <button className="btn btn--small" onClick={approveAll}>Aprovar as {filtered.length} do filtro</button>
        )}
      </div>

      <div className="card">
        {!filtered.length ? (
          <EmptyState icon="🏃" label="Nenhuma prova com esses filtros." />
        ) : (
          <div className="table-wrap">
            <table className="resp-table" aria-label="Provas de corrida">
              <thead>
                <tr><th scope="col">Data</th><th scope="col">Prova</th><th scope="col">Local</th><th scope="col">Distâncias</th><th scope="col">Situação</th><th scope="col"></th></tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map(r => (
                  <tr key={r.id}>
                    <td data-label="Data">{dateBr(r.event_date)}</td>
                    <td data-label="Prova">
                      {r.name}
                      <div className="user-detail__meta">
                        {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">link do organizador</a> : 'sem link'}
                        {r.source_url && <> · <a href={r.source_url} target="_blank" rel="noopener noreferrer">fonte ({r.source})</a></>}
                      </div>
                    </td>
                    <td data-label="Local">
                      {[r.city, r.state].filter(Boolean).join('/')}
                      {r.venue && <div className="user-detail__meta">{r.venue}</div>}
                      {r.lat == null && <div className="user-detail__meta">sem coordenadas</div>}
                    </td>
                    <td data-label="Distâncias">{distancesToText(r.distances) || '—'}</td>
                    <td data-label="Situação">
                      <span className={`badge${r.status === 'approved' ? ' badge--ok' : ''}`}>{EVENT_STATUS[r.status]}</span>
                    </td>
                    <td data-label="">
                      <div className="actions-row">
                        {r.status !== 'approved' && <button className="btn btn--small" onClick={() => changeStatus([r], 'approved', 'aprovada(s)')}>Aprovar</button>}
                        {r.status !== 'rejected' && <button className="btn btn--ghost btn--small" onClick={() => changeStatus([r], 'rejected', 'descartada(s)')}>Descartar</button>}
                        <button className="btn btn--ghost btn--small" onClick={() => { setForm({ editing: r }); setMsg(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
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
        {filtered.length > 0 && <p className="card-note">{filtered.length} prova(s) no filtro.</p>}
      </div>
    </div>
  );
}
