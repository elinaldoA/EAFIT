import { useEffect, useMemo, useState } from 'react';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { downloadCsv, toCsv } from '../lib/csv';
import { KIND_LABELS, ORIGIN_LABELS, fetchCampaignEffect, summarizeCampaigns } from '../lib/campaignEffect';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 0, label: 'Tudo' },
];

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'manual', label: 'Manuais' },
  { key: 'auto', label: 'Automáticas' },
];

const fmtPct = v => (v == null ? '—' : `${v}%`);
const fmtLift = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${v} p.p.`);
const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

function when(c) {
  if (c.origin !== 'auto') return new Date(c.firstAt).toLocaleString('pt-BR');
  return c.firstAt === c.lastAt ? fmtDate(c.firstAt) : `${fmtDate(c.firstAt)} a ${fmtDate(c.lastAt)}`;
}

const CSV_COLUMNS = [
  { key: 'firstAt', label: 'Primeiro envio' }, { key: 'lastAt', label: 'Último envio' },
  { key: 'origin', label: 'Origem' }, { key: 'kind', label: 'Tipo' }, { key: 'title', label: 'Título' },
  { key: 'sent', label: 'Envios' }, { key: 'received', label: 'Chegaram ao aparelho' }, { key: 'clicked', label: 'Tocaram na notificação' }, { key: 'read', label: 'Leram no sino' }, { key: 'app1', label: 'Abriram o app até o dia seguinte' },
  { key: 'trained1', label: 'Treinaram até o dia seguinte' }, { key: 'trained3', label: 'Treinaram em até 3 dias' },
  { key: 'before3', label: 'Treinaram nos 3 dias antes' }, { key: 'lift', label: 'Diferença (p.p.)' },
];

// Comunicação → Resultados: o que cada envio provocou.
export default function CampaignResults() {
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchCampaignEffect(days)
      .then(rows => { if (active) setItems(rows); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const visible = useMemo(() => (filter === 'all' ? items : items.filter(i => i.origin === filter)), [items, filter]);
  const total = useMemo(() => summarizeCampaigns(visible), [visible]);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Resultados dos envios</h1>
          <p className="page-subtitle">
            Para cada notificação, quem leu no sino do app, quem abriu o app e quem treinou depois. A última coluna
            compara quem treinou nos 3 dias depois do envio com quem treinou nos 3 dias antes (as mesmas pessoas): é
            o sinal de que a mensagem fez diferença. As automáticas aparecem somadas por tipo. Admins não contam.
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

      <div className="actions-row">
        {FILTERS.map(f => (
          <button
            key={f.key} type="button"
            className={filter === f.key ? 'btn btn--primary btn--small' : 'btn btn--ghost btn--small'}
            onClick={() => setFilter(f.key)}
          >{f.label}</button>
        ))}
        <button
          type="button" className="btn btn--ghost btn--small" disabled={!visible.length}
          onClick={() => downloadCsv('resultados-envios.csv', toCsv(visible, CSV_COLUMNS))}
        >Exportar CSV</button>
      </div>

      {loading && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}

      {!loading && !error && visible.length === 0 && <EmptyState icon="📬" label="Nenhum envio no período." />}

      {!loading && !error && visible.length > 0 && (
        <>
          <div className="tile-grid">
            <div className="tile"><div className="tile__value">{total.sent}</div><div className="tile__label">envios ({total.campaigns} campanha(s))</div></div>
            <div className="tile"><div className="tile__value">{fmtPct(total.readPct)}</div><div className="tile__label">leram no sino</div></div>
            <div className="tile"><div className="tile__value">{fmtPct(total.appPct)}</div><div className="tile__label">abriram o app até o dia seguinte</div></div>
            <div className="tile"><div className="tile__value">{fmtPct(total.trained3Pct)}</div><div className="tile__label">treinaram em até 3 dias</div></div>
            <div className="tile"><div className="tile__value">{fmtLift(total.lift)}</div><div className="tile__label">vs. os 3 dias antes</div></div>
          </div>

          <div className="table-wrap">
            <table className="resp-table">
              <thead>
                <tr>
                  <th>Quando</th><th>Envio</th><th>Envios</th><th>Chegaram</th><th>Tocaram</th><th>Leram</th><th>Abriram o app</th>
                  <th>Treinaram (1 dia)</th><th>Treinaram (3 dias)</th><th>Antes (3 dias)</th><th>Diferença</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(c => (
                  <tr key={c.key}>
                    <td data-label="Quando">{when(c)}</td>
                    <td data-label="Envio">
                      <strong>{c.title}</strong>
                      <div className="user-detail__meta">
                        {ORIGIN_LABELS[c.origin] || c.origin}{c.origin === 'manual' && KIND_LABELS[c.kind] && c.kind !== 'aviso' ? ` · ${KIND_LABELS[c.kind]}` : ''}
                      </div>
                    </td>
                    <td data-label="Envios">{c.sent}</td>
                    <td data-label="Chegaram">{fmtPct(c.receivedPct)}</td>
                    <td data-label="Tocaram">{fmtPct(c.clickedPct)}</td>
                    <td data-label="Leram">{fmtPct(c.readPct)}</td>
                    <td data-label="Abriram o app">{fmtPct(c.appPct)}</td>
                    <td data-label="Treinaram (1 dia)">{fmtPct(c.trained1Pct)}</td>
                    <td data-label="Treinaram (3 dias)">{fmtPct(c.trained3Pct)}</td>
                    <td data-label="Antes (3 dias)">{fmtPct(c.before3Pct)}</td>
                    <td data-label="Diferença">{fmtLift(c.lift)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="user-detail__meta">
        Os dias seguem o calendário de Brasília: "1 dia" é o dia do envio e o seguinte. Envios recentes ainda não tiveram
        3 dias para mostrar resultado. "Leram" depende de a pessoa abrir o sino no app. "Chegaram" e "Tocaram" vêm do próprio aparelho (só envios manuais e agendados, e só de quem já atualizou o app), então são um mínimo, não o total.
      </p>
    </div>
  );
}
