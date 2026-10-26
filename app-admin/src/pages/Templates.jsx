import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import WorkoutTemplateEditor from '../components/WorkoutTemplateEditor';
import Loading from '../components/Loading';

const METAS = ['massa', 'forca', 'emagrecer', 'definicao', 'saude', 'resistencia'];

export default function Templates() {
  const [meta, setMeta] = useState('massa');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setMsg('');
    db.from('workout_templates').select('days').eq('meta', meta).single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        setData(data?.days ?? []);
      })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [meta]);

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const { error } = await db.from('workout_templates')
        .update({ days: data, updated_at: new Date().toISOString() })
        .eq('meta', meta);
      if (error) throw error;
      setMsg('Salvo!');
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Conteúdo</h1>
      </div>

      <div className="actions-row" style={{ marginBottom: 16 }}>
        <select className="input" style={{ maxWidth: 180 }} value={meta} onChange={e => setMeta(e.target.value)}>
          {METAS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading && <Loading label="Carregando template…" />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && data && (
        <div className="stack">
          <WorkoutTemplateEditor days={data} onChange={setData} />

          {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

          <div>
            <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>

          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}>Ver JSON</summary>
            <pre className="template-json-preview">{JSON.stringify(data, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
