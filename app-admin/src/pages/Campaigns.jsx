import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { downloadCsv, toCsv } from '../lib/csv';
import { fetchCampaigns, formatMoney, saveCost } from '../lib/campaigns';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Tudo' },
];
const fmtPct = v => (v == null ? '—' : `${v}%`);

function CostCell({ item, onSaved }) {
  const { adminUser } = useAdminAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.cost == null ? '' : String(item.cost));
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try { await saveCost(item.source, item.campaign, value || 0, adminUser?.id); setEditing(false); onSaved(); } catch (err) { setError(err.message); }
  }

  if (!editing) {
    return (
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)} aria-label={`Custo de ${item.label} ${item.campaign}`}>
        {item.cost == null ? 'Informar' : formatMoney(item.cost)}
      </button>
    );
  }
  return (
    <div className="actions-row">
      <input className="input input--sm" style={{ maxWidth: 110 }} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} aria-label="Valor gasto (R$)" />
      <button type="button" className="btn btn--small btn--primary" onClick={save}>Salvar</button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(false)}>Cancelar</button>
      {error && <span className="form-msg form-msg--error">{error}</span>}
    </div>
  );
}

// Análises → Campanhas.
export default function Campaigns() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchCampaigns(days).then(d => { setData(d); setError(''); }).catch(err => setError(err.message));
  }, [days]);
  useEffect(() => { setData(null); load(); }, [load]);

  function exportCsv() {
    downloadCsv('campanhas.csv', toCsv(data.items, [
      { key: 'source', label: 'Origem' }, { key: 'campaign', label: 'Campanha' }, { key: 'visits', label: 'Visitas' },
      { key: 'signups', label: 'Cadastros' }, { key: 'confirmed', label: 'Confirmados' }, { key: 'activated', label: 'Ativaram7d' },
      { key: 'active30', label: 'Ativos30d' }, { key: 'cost', label: 'Custo' }, { key: 'costPerActivated', label: 'CustoPorAtivado' },
    ]));
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Campanhas</h1>
          <p className="page-subtitle">
            De onde vêm os cadastros e quanto cada origem ativa. Vale a primeira chegada de fora (link com utm_source ou
            ?origem=, ou vindo de outro site), guardada por 30 dias até o cadastro. Use links como
            <code> eafit.com.br/?utm_source=instagram&amp;utm_campaign=outubro_rosa</code>. Informe o valor gasto para ver
            o custo por cadastro ativado.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Período">
          {PERIODS.map(p => (
            <button key={p.days} type="button" aria-pressed={days === p.days} className={`seg__btn${days === p.days ? ' seg__btn--active' : ''}`} onClick={() => setDays(p.days)}>{p.label}</button>
          ))}
        </div>
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!data && !error && <Loading />}
      {data && data.items.length === 0 && <EmptyState icon="📣" label="Nenhum cadastro ou visita de fora no período." />}
      {data && data.items.length > 0 && (
        <>
          <div className="tile-grid">
            <div className="tile"><div className="tile__value">{data.totals.signups}</div><div className="tile__label">cadastros ({data.totals.visits} visitas de fora)</div></div>
            <div className="tile"><div className="tile__value">{fmtPct(data.totals.activationPct)}</div><div className="tile__label">treinaram na 1ª semana ({data.totals.activated})</div></div>
            <div className="tile"><div className="tile__value">{data.totals.active30}</div><div className="tile__label">seguem ativos (30 dias)</div></div>
            <div className="tile"><div className="tile__value">{formatMoney(data.totals.costPerActivated)}</div><div className="tile__label">custo por ativado ({formatMoney(data.totals.cost)} gastos)</div></div>
          </div>
          <div className="actions-row"><button type="button" className="btn btn--ghost btn--small" onClick={exportCsv}>Exportar CSV</button></div>
          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr>
                  <th>Origem</th><th>Campanha</th><th>Visitas</th><th>Cadastros</th><th>Conversão</th><th>Ativaram (7 dias)</th>
                  <th>Ativos (30 dias)</th><th>Gasto</th><th>Por ativado</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(i => (
                  <tr key={i.key}>
                    <td data-label="Origem">{i.label}</td>
                    <td data-label="Campanha">{i.campaign || '—'}</td>
                    <td data-label="Visitas">{i.visits}</td>
                    <td data-label="Cadastros">{i.signups}</td>
                    <td data-label="Conversão">{fmtPct(i.conversionPct)}</td>
                    <td data-label="Ativaram (7 dias)">{i.signups ? `${i.activated} (${fmtPct(i.activationPct)})` : '—'}</td>
                    <td data-label="Ativos (30 dias)">{i.signups ? `${i.active30} (${fmtPct(i.active30Pct)})` : '—'}</td>
                    <td data-label="Gasto">{i.source === 'sem_origem' ? '—' : <CostCell key={`${i.key}-${i.cost}`} item={i} onSaved={load} />}</td>
                    <td data-label="Por ativado">{formatMoney(i.costPerActivated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="card-note">
            Visitas contam no máximo 1 por dia por navegador (landing e tela de acesso). Contas criadas antes desta versão
            usam a origem do link de embaixador quando houver; as demais aparecem como “sem origem registrada”. Sem admins.
          </p>
        </>
      )}
    </div>
  );
}
