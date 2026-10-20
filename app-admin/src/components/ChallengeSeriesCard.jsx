import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from './Loading';
import { formatDay, todayStr } from '../lib/community';
import {
  CADENCE_LABELS, SERIES_TITLE_MAX, createSeries, fetchSeries, fetchSeriesReport, seriesTrend, setSeriesActive, spawnNow,
} from '../lib/challengeSeries';

const fmtPct = v => (v == null ? '' : ` (${v}%)`);

function SeriesReport({ series }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { fetchSeriesReport(series.id).then(setRows).catch(err => setError(err.message)); }, [series.id]);

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!rows) return <Loading />;
  if (rows.length === 0) return <p className="user-detail__meta">Nenhuma edição criada ainda.</p>;
  const trend = seriesTrend(rows, todayStr());
  return (
    <>
      {trend && (
        <p className="user-detail__meta">
          Última edição: {trend.current} participante(s), {trend.diff >= 0 ? `+${trend.diff}` : trend.diff} em relação à anterior.
        </p>
      )}
      <div className="table-wrap">
        <table className="resp-table">
          <thead><tr><th>Edição</th><th>Participantes</th><th>Treinaram</th><th>Bateram a meta ({series.min_days}+ dias)</th><th>Voltaram da anterior</th><th>Média de dias</th></tr></thead>
          <tbody>
            {rows.map(e => (
              <tr key={e.id}>
                <td data-label="Edição"><strong>{e.title}</strong><div className="user-detail__meta">{formatDay(e.start)} a {formatDay(e.end)} · código <code>{e.code}</code></div></td>
                <td data-label="Participantes">{e.members}</td>
                <td data-label="Treinaram">{e.trained}{fmtPct(e.trainedPct)}</td>
                <td data-label="Bateram a meta">{e.completed}{fmtPct(e.completedPct)}</td>
                <td data-label="Voltaram da anterior">{e.returning}{fmtPct(e.returningPct)}</td>
                <td data-label="Média de dias">{e.avgDays ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Comunidade → Desafios → Desafios recorrentes.
export default function ChallengeSeriesCard({ onSpawned }) {
  const { adminUser } = useAdminAuth();
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ title: '', cadence: 'semanal', minDays: '3' });
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    fetchSeries().then(setList).catch(err => setMsg(`Erro: ${err.message}`));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(fn, ok) {
    setMsg('');
    try {
      const made = await fn();
      setMsg(typeof made === 'number' && made > 0 ? `${ok} ${made} edição(ões) criada(s).` : ok);
      load();
      if (made > 0) onSpawned?.();
    } catch (err) { setMsg(`Erro: ${err.message}`); }
  }

  function submit(e) {
    e.preventDefault();
    run(async () => {
      const made = await createSeries({ ...form, minDays: Number(form.minDays) }, adminUser?.id);
      setForm({ title: '', cadence: form.cadence, minDays: form.minDays });
      return made;
    }, 'Série criada.');
  }

  return (
    <div className="card stack" style={{ gap: 14 }}>
      <div>
        <h2 className="section-title" style={{ margin: 0 }}>Desafios recorrentes</h2>
        <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>
          O EAFIT cria sozinho um desafio oficial a cada semana ou mês, 3 dias antes de começar, e ele aparece no app
          para todos entrarem. A primeira edição é a do próximo período (ou a de agora, se ainda não começou).
        </p>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Nome</span>
          <input className="input" maxLength={SERIES_TITLE_MAX} value={form.title} placeholder="Desafio EAFIT"
            onChange={e => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Frequência</span>
          <select className="input" value={form.cadence} onChange={e => setForm({ ...form, cadence: e.target.value })}>
            {Object.entries(CADENCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Meta (dias treinados)</span>
          <input className="input" type="number" min={1} max={form.cadence === 'semanal' ? 7 : 31} value={form.minDays}
            onChange={e => setForm({ ...form, minDays: e.target.value })} />
        </label>
        <div className="actions-row" style={{ alignSelf: 'end' }}>
          <button className="btn btn--primary btn--small" type="submit">Criar série</button>
        </div>
      </form>
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

      {!list ? <Loading /> : list.length > 0 && (
        <div className="stack" style={{ gap: 10 }}>
          {list.map(s => (
            <div key={s.id} className="stack" style={{ gap: 6 }}>
              <div className="actions-row">
                <strong>{s.title}</strong>
                <span className="user-detail__meta">{CADENCE_LABELS[s.cadence]} · meta {s.min_days} dia(s)</span>
                {!s.active && <span className="badge">pausada</span>}
                <button type="button" className="btn btn--small" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  {open === s.id ? 'Ocultar relatório' : 'Relatório'}
                </button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => run(() => setSeriesActive(s.id, !s.active), s.active ? 'Série pausada.' : 'Série retomada.')}>
                  {s.active ? 'Pausar' : 'Retomar'}
                </button>
              </div>
              {open === s.id && <SeriesReport series={s} />}
            </div>
          ))}
          <div className="actions-row">
            <button type="button" className="btn btn--ghost btn--small" onClick={() => run(spawnNow, 'Conferido.')}>Criar edições pendentes agora</button>
          </div>
        </div>
      )}
    </div>
  );
}
