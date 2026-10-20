import { useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { downloadCsv, toCsv } from '../lib/csv';
import { formatDay } from '../lib/community';
import {
  CATALOG, COMPARE, DEFAULT_CARDS, PERIODS,
  compareRange, fetchMyCards, fetchReport, formatMetric, periodRange, saveMyCards,
} from '../lib/reports';

function Delta({ card }) {
  if (card.delta == null) return <span className="user-detail__meta">sem comparação</span>;
  const sign = card.delta > 0 ? '+' : '';
  const cls = card.better == null ? 'user-detail__meta' : card.better ? 'badge badge--ok' : 'badge badge--danger';
  const unit = card.format === 'pct' ? ' p.p.' : '';
  return (
    <span className={cls}>
      {sign}{card.delta.toLocaleString('pt-BR')}{unit}{card.deltaPct != null && card.format !== 'pct' ? ` (${sign}${card.deltaPct}%)` : ''}
    </span>
  );
}

// Análises → Meu relatório.
export default function MyReport() {
  const { adminUser } = useAdminAuth();
  const [cards, setCards] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [mode, setMode] = useState('anterior');
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!adminUser?.id) return;
    fetchMyCards(adminUser.id).then(setCards).catch(() => setCards(DEFAULT_CARDS));
  }, [adminUser?.id]);

  const range = useMemo(() => periodRange(period, undefined, custom), [period, custom]);
  const cmp = useMemo(() => (mode ? compareRange(range, mode) : null), [range, mode]);

  useEffect(() => {
    if (!cards) return;
    let active = true;
    setRows(null);
    fetchReport(cards, range, cmp)
      .then(r => { if (active) { setRows(r); setError(''); } })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [cards, range, cmp]);

  function move(i, d) {
    const next = [...cards];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setCards(next);
  }

  async function save() {
    setMsg('');
    try { await saveMyCards(adminUser.id, cards); setMsg('Cartões salvos.'); setEditing(false); } catch (err) { setMsg(`Erro: ${err.message}`); }
  }

  function exportCsv() {
    downloadCsv(`relatorio-${range.from}-${range.to}.csv`, toCsv(rows.map(r => ({ ...r, value: r.value ?? '', prev: r.prev ?? '', delta: r.delta ?? '' })), [
      { key: 'label', label: 'Metrica' }, { key: 'value', label: `${range.from}_a_${range.to}` },
      { key: 'prev', label: cmp ? `${cmp.from}_a_${cmp.to}` : 'Comparacao' }, { key: 'delta', label: 'Diferenca' },
    ]));
  }

  const available = Object.entries(CATALOG).filter(([k]) => !cards?.includes(k));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Meu relatório</h1>
          <p className="page-subtitle">
            Escolha os números que você acompanha e compare qualquer período com o anterior ou com o mesmo período do ano
            passado. Os cartões ficam salvos para você.
          </p>
        </div>
        <div className="actions-row">
          <button type="button" className="btn btn--small" onClick={() => setEditing(!editing)}>{editing ? 'Fechar edição' : 'Editar cartões'}</button>
          {rows?.length > 0 && <button type="button" className="btn btn--ghost btn--small" onClick={exportCsv}>Exportar CSV</button>}
        </div>
      </div>

      <div className="card actions-row" style={{ alignItems: 'flex-end' }}>
        <div className="seg" role="group" aria-label="Período">
          {PERIODS.map(p => (
            <button key={p.key} type="button" aria-pressed={period === p.key} className={`seg__btn${period === p.key ? ' seg__btn--active' : ''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
        {period === 'custom' && (
          <>
            <label className="field" style={{ maxWidth: 160 }}><span className="field__label">De</span>
              <input className="input input--sm" type="date" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} aria-label="De" /></label>
            <label className="field" style={{ maxWidth: 160 }}><span className="field__label">Até</span>
              <input className="input input--sm" type="date" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} aria-label="Até" /></label>
          </>
        )}
        <label className="field" style={{ maxWidth: 260 }}>
          <span className="field__label">Comparar com</span>
          <select className="input input--sm" value={mode} onChange={e => setMode(e.target.value)} aria-label="Comparar com">
            {Object.entries(COMPARE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            <option value="">Sem comparação</option>
          </select>
        </label>
        <span className="user-detail__meta">
          {formatDay(range.from)} a {formatDay(range.to)}{cmp ? ` · vs ${formatDay(cmp.from)} a ${formatDay(cmp.to)}` : ''}
        </span>
      </div>

      {editing && cards && (
        <div className="card stack" style={{ gap: 8 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Cartões ({cards.length})</h2>
          {cards.map((k, i) => (
            <div key={k} className="actions-row">
              <span style={{ flex: 1 }}>{CATALOG[k].label} <span className="user-detail__meta">· {CATALOG[k].group}</span></span>
              <button type="button" className="btn btn--ghost btn--small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${CATALOG[k].label}`}>↑</button>
              <button type="button" className="btn btn--ghost btn--small" disabled={i === cards.length - 1} onClick={() => move(i, 1)} aria-label={`Descer ${CATALOG[k].label}`}>↓</button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setCards(cards.filter(x => x !== k))} aria-label={`Tirar ${CATALOG[k].label}`}>Tirar</button>
            </div>
          ))}
          <div className="actions-row">
            <select className="input input--sm" value="" aria-label="Adicionar cartão" onChange={e => e.target.value && setCards([...cards, e.target.value])}>
              <option value="">Adicionar cartão…</option>
              {available.map(([k, d]) => <option key={k} value={k}>{d.group} · {d.label}</option>)}
            </select>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setCards(DEFAULT_CARDS)}>Voltar ao padrão</button>
            <button type="button" className="btn btn--primary btn--small" onClick={save}>Salvar cartões</button>
          </div>
        </div>
      )}
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      {error && <p className="form-msg form-msg--error">{error.includes('invalid_period') ? 'Período inválido (até 366 dias).' : error}</p>}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && <EmptyState icon="🧩" label="Nenhum cartão. Use Editar cartões para escolher." />}
      {rows && rows.length > 0 && (
        <div className="tile-grid">
          {rows.map(r => (
            <div className="tile" key={r.key}>
              <div className="tile__value">{formatMetric(r, r.value)}</div>
              <div className="tile__label">{r.label}</div>
              <div style={{ marginTop: 6 }}><Delta card={r} /> {r.prev != null && <span className="user-detail__meta">antes: {formatMetric(r, r.prev)}</span>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
