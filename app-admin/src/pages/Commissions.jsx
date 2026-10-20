import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { downloadCsv, toCsv } from '../lib/csv';
import {
  KIND_LABELS, PAYOUT_BADGE, PAYOUT_LABELS,
  closeMonth, currentMonth, fetchCommissions, money, saveOverride, saveRule, summarize, updatePayout,
} from '../lib/commissions';

function RulesCard({ rules, onSaved }) {
  const { adminUser } = useAdminAuth();
  const [draft, setDraft] = useState(() => Object.fromEntries(Object.keys(KIND_LABELS).map(k => [k, String(rules[k] ?? 0)])));
  const [msg, setMsg] = useState('');

  async function save() {
    setMsg('');
    try {
      for (const k of Object.keys(KIND_LABELS)) if (Number(String(draft[k]).replace(',', '.')) !== (rules[k] ?? 0)) await saveRule(k, draft[k], adminUser?.id);
      setMsg('Salvo.');
      onSaved();
    } catch (err) { setMsg(`Erro: ${err.message}`); }
  }

  return (
    <div className="card">
      <h2 className="section-title">Valor por cadastro ativado</h2>
      <div className="actions-row" style={{ alignItems: 'flex-end' }}>
        {Object.entries(KIND_LABELS).map(([k, l]) => (
          <label key={k} className="field" style={{ maxWidth: 180 }}>
            <span className="field__label">{l} (R$)</span>
            <input className="input" inputMode="decimal" value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} aria-label={`Valor para ${l}`} />
          </label>
        ))}
        <button type="button" className="btn btn--primary btn--small" onClick={save}>Salvar</button>
        {msg && <span className={msg.startsWith('Erro') ? 'form-msg form-msg--error' : 'form-msg'}>{msg}</span>}
      </div>
      <p className="card-note">
        Cadastro ativado = conta criada pelo link do parceiro que treinou nos 7 primeiros dias. Um valor diferente para
        alguém específico pode ser definido na linha dele (vazio = usa o do tipo). Mudar o valor não altera meses já fechados.
      </p>
    </div>
  );
}

function RateCell({ row, onSaved }) {
  const { adminUser } = useAdminAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.override ? String(row.rate) : '');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try { await saveOverride(row.id, value, adminUser?.id); setEditing(false); onSaved(); } catch (err) { setError(err.message); }
  }

  if (!editing) {
    return (
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)} aria-label={`Valor de ${row.name}`}>
        {money(row.rate)}{row.override ? ' *' : ''}
      </button>
    );
  }
  return (
    <div className="actions-row">
      <input className="input input--sm" style={{ maxWidth: 90 }} inputMode="decimal" placeholder="do tipo" value={value} onChange={e => setValue(e.target.value)} aria-label={`Exceção de ${row.name}`} />
      <button type="button" className="btn btn--small btn--primary" onClick={save}>Salvar</button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(false)}>Cancelar</button>
      {error && <span className="form-msg form-msg--error">{error}</span>}
    </div>
  );
}

// Pessoas → Comissões.
export default function Commissions() {
  const { adminUser } = useAdminAuth();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchCommissions(month).then(d => { setData(d); setError(''); }).catch(err => setError(err.message));
  }, [month]);
  useEffect(() => { setData(null); load(); }, [load]);

  async function act(fn) {
    try { await fn(); load(); } catch (err) { setError(err.message); }
  }

  const totals = data ? summarize(data.rows) : null;

  function exportCsv() {
    downloadCsv(`comissoes-${month}.csv`, toCsv(data.rows.map(r => ({
      ...r, tipo: KIND_LABELS[r.kind], fechado: r.payout ? r.payout.amount : '', situacao: r.payout ? PAYOUT_LABELS[r.payout.status] : 'aberto',
      notas: r.payout?.notes || '',
    })), [
      { key: 'name', label: 'Parceiro' }, { key: 'tipo', label: 'Tipo' }, { key: 'code', label: 'Codigo' },
      { key: 'referrals', label: 'Indicacoes' }, { key: 'activated', label: 'Ativados' }, { key: 'rate', label: 'ValorPorAtivado' },
      { key: 'amount', label: 'Calculado' }, { key: 'fechado', label: 'Fechado' }, { key: 'situacao', label: 'Situacao' }, { key: 'notas', label: 'Notas' },
    ]));
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Comissões</h1>
          <p className="page-subtitle">
            Quanto cada embaixador e influenciador tem a receber no mês pelos cadastros que ativaram. Feche o mês de cada
            um (o valor fica guardado) e marque como pago quando fizer o repasse.
          </p>
        </div>
        <label className="field" style={{ maxWidth: 180 }}>
          <span className="field__label">Mês</span>
          <input className="input" type="month" value={month} max={currentMonth()} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="Mês" />
        </label>
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <RulesCard key={JSON.stringify(data.rules)} rules={data.rules} onSaved={load} />
          <div className="tile-grid">
            <div className="tile"><div className="tile__value">{totals.activated}</div><div className="tile__label">cadastros ativados ({totals.referrals} indicações)</div></div>
            <div className="tile"><div className="tile__value">{money(totals.calculated)}</div><div className="tile__label">calculado no mês</div></div>
            <div className="tile"><div className="tile__value">{money(totals.pending)}</div><div className="tile__label">fechado e a pagar</div></div>
            <div className="tile"><div className="tile__value">{money(totals.paid)}</div><div className="tile__label">pago</div></div>
          </div>
          {data.rows.length === 0 ? <EmptyState icon="🤝" label="Nenhum parceiro ativo ou com indicação no mês." /> : (
            <>
              <div className="actions-row"><button type="button" className="btn btn--ghost btn--small" onClick={exportCsv}>Exportar CSV do mês</button></div>
              <div className="table-wrap">
                <table className="resp-table">
                  <thead><tr><th>Parceiro</th><th>Indicações</th><th>Ativados</th><th>Por ativado</th><th>Calculado</th><th>Fechamento</th><th>Notas</th></tr></thead>
                  <tbody>
                    {data.rows.map(r => (
                      <tr key={r.id}>
                        <td data-label="Parceiro">
                          {r.userId ? <Link to={`/users/${r.userId}`}>{r.name}</Link> : r.name}
                          <div className="user-detail__meta">{KIND_LABELS[r.kind]} · {r.code}{!r.active ? ' · inativo' : ''}</div>
                        </td>
                        <td data-label="Indicações">{r.referrals}</td>
                        <td data-label="Ativados">{r.activated}</td>
                        <td data-label="Por ativado"><RateCell key={`${r.id}-${r.rate}-${r.override}`} row={r} onSaved={load} /></td>
                        <td data-label="Calculado">{money(r.amount)}</td>
                        <td data-label="Fechamento">
                          {!r.payout ? (
                            <button type="button" className="btn btn--small" disabled={!r.amount} onClick={() => act(() => closeMonth(r, month, adminUser?.id))}>Fechar {money(r.amount)}</button>
                          ) : (
                            <div className="actions-row">
                              <span className={PAYOUT_BADGE[r.payout.status]}>{money(r.payout.amount)}</span>
                              <select className="input input--sm" aria-label={`Situação de ${r.name}`} value={r.payout.status}
                                onChange={e => act(() => updatePayout(r.id, month, { status: e.target.value }, adminUser?.id))}>
                                {Object.entries(PAYOUT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </select>
                              {r.payout.amount !== r.amount && (
                                <button type="button" className="btn btn--ghost btn--small" title="O cálculo mudou depois do fechamento"
                                  onClick={() => act(() => closeMonth(r, month, adminUser?.id))}>Recalcular ({money(r.amount)})</button>
                              )}
                            </div>
                          )}
                        </td>
                        <td data-label="Notas">
                          {r.payout ? (
                            <input className="input input--sm" defaultValue={r.payout.notes} maxLength={500} aria-label={`Notas de ${r.name}`}
                              onBlur={e => e.target.value !== r.payout.notes && act(() => updatePayout(r.id, month, { notes: e.target.value }, adminUser?.id))} />
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="card-note">* valor diferente do tipo para este parceiro. Indicações contam pelo mês do vínculo da conta (horário de Brasília).</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
