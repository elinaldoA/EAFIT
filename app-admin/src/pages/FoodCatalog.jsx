import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EMPTY_FOOD, toDraft, validateFood, filterFoods, friendlyFoodError,
  fetchFoodCatalogAdmin, saveFood, deleteFood,
} from '../lib/foodCatalog';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { useConfirm } from '../context/confirmContext';

const PAGE = 50;
const NUM_FIELDS = [
  ['portion_g', 'Porção sugerida (g)'], ['kcal', 'Calorias (kcal/100 g)'], ['protein_g', 'Proteína (g/100 g)'],
  ['carbs_g', 'Carboidratos (g/100 g)'], ['fat_g', 'Gorduras (g/100 g)'], ['fiber_g', 'Fibra (g/100 g)'], ['sodium_mg', 'Sódio (mg/100 g)'],
  ['sugar_g', 'Açúcares (g/100 g, opcional)'], ['sat_fat_g', 'Gordura saturada (g/100 g, opcional)'],
];

function FoodForm({ editing, categories, onCancel, onSaved }) {
  const [draft, setDraft] = useState(editing ? toDraft(editing) : { ...EMPTY_FOOD });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const err = k => errors[k] && <span className="form-msg form-msg--error" role="alert">{errors[k]}</span>;

  async function handleSubmit(e) {
    e.preventDefault();
    const { ok, errors: errs, value } = validateFood(draft);
    setErrors(errs);
    if (!ok) return;
    setBusy(true);
    setMsg('');
    try {
      await saveFood(editing?.id, value);
      await onSaved();
    } catch (error) {
      setMsg(`Erro: ${friendlyFoodError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" style={{ gap: 14 }} onSubmit={handleSubmit}>
      <h2 className="section-title" style={{ margin: 0 }}>{editing ? `Editar: ${editing.name}` : 'Novo alimento'}</h2>
      <div className="form-grid">
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field__label">Nome (igual a um alimento do app para substituí-lo)</span>
          <input className="input" value={draft.name} maxLength={60} onChange={e => set('name', e.target.value)} />
          {err('name')}
        </label>
        <label className="field">
          <span className="field__label">Ícone</span>
          <input className="input" value={draft.icon} onChange={e => set('icon', e.target.value)} />
          {err('icon')}
        </label>
        <label className="field">
          <span className="field__label">Categoria</span>
          <input className="input" list="food-categories" value={draft.category} onChange={e => set('category', e.target.value)} />
          {err('category')}
        </label>
        {NUM_FIELDS.map(([k, label]) => (
          <label className="field" key={k}>
            <span className="field__label">{label}</span>
            <input className="input" inputMode="decimal" value={draft[k]} onChange={e => set(k, e.target.value)} />
            {err(k)}
          </label>
        ))}
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field__label">Medidas caseiras (ex.: fatia=30; copo=200)</span>
          <input className="input" value={draft.measures} onChange={e => set('measures', e.target.value)} />
          {err('measures')}
        </label>
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={draft.estimated} onChange={e => set('estimated', e.target.checked)} />
        <span>Valor aproximado (prato ou receita): a busca mostra o selo "estimado".</span>
      </label>
      <label className="switch-row">
        <input type="checkbox" checked={draft.active} onChange={e => set('active', e.target.checked)} />
        <span>Ativo: aparece na busca do app.</span>
      </label>
      <datalist id="food-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
      {msg && <p className="form-msg form-msg--error" role="alert">{msg}</p>}
      <div className="actions-row">
        <button className="btn btn--primary btn--small" type="submit" disabled={busy}>{editing ? 'Salvar' : 'Criar alimento'}</button>
        <button className="btn btn--ghost btn--small" type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default function FoodCatalog() {
  const ask = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      setRows(await fetchFoodCatalogAdmin());
      setError('');
    } catch (err) {
      setError(friendlyFoodError(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => filterFoods(rows, filters), [rows, filters]);
  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setShown(PAGE); };

  async function handleDelete(row) {
    if (!await ask(`Excluir "${row.name}" do catálogo? Ele some da busca do app na próxima abertura. Para só esconder, desative.`)) return;
    setMsg('');
    try {
      await deleteFood(row.id);
      setMsg(`"${row.name}" excluído.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${friendlyFoodError(err)}`);
    }
  }

  async function handleSaved() {
    setForm(null);
    setMsg('Salvo. O app mostra na próxima vez que a aba Nutrição abrir.');
    await load();
  }

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error" role="alert">{error}</p>;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Catálogo de alimentos</h1>
          <p className="page-subtitle">
            Alimentos da busca da aba Nutrição, além da lista do app e da Tabela TACO. {rows.length} no total.
            Um item com o mesmo nome de um alimento do app substitui o dele.
          </p>
        </div>
        <button className="btn btn--primary btn--small" onClick={() => { setForm({ editing: null }); setMsg(''); }}>Novo alimento</button>
      </div>

      {form && (
        <FoodForm
          key={form.editing?.id || 'new'} editing={form.editing} categories={categories}
          onCancel={() => setForm(null)} onSaved={handleSaved}
        />
      )}

      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`} role={msg.startsWith('Erro') ? 'alert' : 'status'}>{msg}</p>}

      <div className="actions-row">
        <input className="input search-input" placeholder="Buscar por nome…" aria-label="Buscar por nome…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
        <select className="input" value={filters.status} onChange={e => setFilter('status', e.target.value)} aria-label="Situação">
          <option value="">Todos</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="estimados">Valor aproximado</option>
        </select>
      </div>

      <div className="card">
        {!filtered.length ? (
          <EmptyState icon="🍎" label="Nenhum alimento com esses filtros." />
        ) : (
          <div className="table-wrap">
            <table className="resp-table" aria-label="Catálogo de alimentos">
              <thead>
                <tr><th scope="col">Alimento</th><th scope="col">Categoria</th><th scope="col">Por 100 g</th><th scope="col">Porção</th><th scope="col">Situação</th><th scope="col"></th></tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map(r => (
                  <tr key={r.id}>
                    <td data-label="Alimento">{r.icon} {r.name}</td>
                    <td data-label="Categoria">{r.category || '—'}</td>
                    <td data-label="Por 100 g">{r.kcal} kcal · {r.protein_g} P · {r.carbs_g} C · {r.fat_g} G</td>
                    <td data-label="Porção">{r.portion_g} g</td>
                    <td data-label="Situação">
                      {r.active ? <span className="badge badge--ok">ativo</span> : <span className="muted">inativo</span>}
                      {r.estimated && <> <span className="badge">estimado</span></>}
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
        {filtered.length > 0 && <p className="card-note">{filtered.length} alimento(s) no filtro.</p>}
      </div>
    </div>
  );
}
