import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import { formatBytes } from '../lib/health';
import { METRICS, PLAN_PRESETS, estimateCost, fetchCosts, metricValue, normalizePlan, projectQuota, saveCostPlan } from '../lib/costs';

const usd = v => `US$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (m, v) => (m.unit === 'GB' ? formatBytes(v * 1024 ** 3) : Math.round(v).toLocaleString('pt-BR'));

function Spark({ values }) {
  if (values.length < 2) return null;
  const max = Math.max(...values) || 1;
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PlanForm({ plan, onSave }) {
  const [draft, setDraft] = useState(plan);
  const set = (path, value) => setDraft(d => {
    const [a, b] = path.split('.');
    return b ? { ...d, [a]: { ...d[a], [b]: value } } : { ...d, [a]: value };
  });
  const numInput = (path, label, value) => (
    <label className="field" style={{ maxWidth: 170 }} key={path}>
      <span className="field__label">{label}</span>
      <input className="input input--sm" inputMode="decimal" value={value} onChange={e => set(path, e.target.value)} aria-label={label} />
    </label>
  );

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <h2 className="section-title" style={{ margin: 0 }}>Plano e preços</h2>
      <div className="actions-row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ maxWidth: 170 }}>
          <span className="field__label">Plano</span>
          <select className="input input--sm" value={PLAN_PRESETS[draft.plan] ? draft.plan : ''} aria-label="Plano"
            onChange={e => e.target.value && setDraft({ ...normalizePlan(PLAN_PRESETS[e.target.value]), usdBrl: draft.usdBrl })}>
            {Object.keys(PLAN_PRESETS).map(k => <option key={k} value={k}>{k}</option>)}
            {!PLAN_PRESETS[draft.plan] && <option value="">{draft.plan}</option>}
          </select>
        </label>
        {numInput('baseUsd', 'Mensalidade (US$)', draft.baseUsd)}
        {numInput('usdBrl', 'Dólar (R$)', draft.usdBrl)}
      </div>
      <div className="actions-row" style={{ alignItems: 'flex-end' }}>
        {METRICS.map(m => numInput(`quotas.${m.key}`, `${m.label}: incluso (${m.unit})`, draft.quotas[m.key]))}
      </div>
      <div className="actions-row" style={{ alignItems: 'flex-end' }}>
        {METRICS.map(m => numInput(`overUsd.${m.key}`, `${m.label}: US$ por ${m.unit} a mais`, draft.overUsd[m.key]))}
      </div>
      <div className="actions-row">
        <button type="button" className="btn btn--primary btn--small" onClick={() => onSave(normalizePlan(draft))}>Salvar plano</button>
        <a className="btn btn--ghost btn--small" href="https://supabase.com/pricing" target="_blank" rel="noreferrer">Preços atuais ↗</a>
      </div>
    </div>
  );
}

// Sistema → Custos.
export default function Costs() {
  const { adminUser } = useAdminAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    fetchCosts().then(d => { setData(d); setError(''); }).catch(err => setError(err.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function savePlan(plan) {
    setMsg('');
    try { await saveCostPlan(plan, adminUser?.id); setMsg('Plano salvo.'); load(); } catch (err) { setMsg(`Erro: ${err.message}`); }
  }

  const est = data ? estimateCost(data.usage, data.plan) : null;
  const recent = data ? data.snapshots.slice(-30) : [];

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Custos</h1>
          <p className="page-subtitle">
            Uso do Supabase medido no banco, comparado com o que o plano inclui, e quanto o mês sairia no ritmo de hoje.
            Um retrato por dia mostra a tendência e quando cada limite deve estourar.
          </p>
        </div>
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="tile-grid">
            <div className="tile">
              <div className="tile__value">{usd(est.usd)}</div>
              <div className="tile__label">estimativa do mês · plano {data.plan.plan} ({brl(est.brl)})</div>
            </div>
            <div className="tile"><div className="tile__value">{data.usage.users.toLocaleString('pt-BR')}</div><div className="tile__label">contas criadas</div></div>
            <div className="tile"><div className="tile__value">{data.usage.storageObjects.toLocaleString('pt-BR')}</div><div className="tile__label">arquivos no Storage</div></div>
            <div className="tile"><div className="tile__value">{data.usage.push.toLocaleString('pt-BR')}</div><div className="tile__label">aparelhos com push</div></div>
          </div>

          <div className="card">
            <h2 className="section-title">Uso x plano</h2>
            <div className="table-wrap">
              <table className="resp-table">
                <thead><tr><th>Recurso</th><th>Usado</th><th>Incluso</th><th>Uso</th><th>Excedente</th><th>Tendência (30 dias)</th></tr></thead>
                <tbody>
                  {est.lines.map(l => {
                    const proj = projectQuota(recent, l, l.quota);
                    return (
                      <tr key={l.key}>
                        <td data-label="Recurso">{l.label}</td>
                        <td data-label="Usado">{fmt(l, l.used)}</td>
                        <td data-label="Incluso">{fmt(l, l.quota)}</td>
                        <td data-label="Uso">
                          <div className="dist__track"><span style={{ width: `${Math.min(100, l.pct ?? 0)}%` }} className={`dist__fill${l.pct >= 80 ? ' dist__fill--warn' : ''}`} /></div>
                          <span className={l.pct >= 80 ? 'badge badge--warning' : 'user-detail__meta'}>{l.pct == null ? '—' : `${l.pct}%`}</span>
                        </td>
                        <td data-label="Excedente">{l.over > 0 ? `${fmt(l, l.over)} · ${usd(l.overUsd)}` : '—'}</td>
                        <td data-label="Tendência (30 dias)">
                          <Spark values={recent.map(s => metricValue(s, l))} />
                          <div className="user-detail__meta">
                            {!proj ? 'poucos dias de histórico'
                              : proj.daysToQuota === null ? 'estável ou caindo'
                                : proj.daysToQuota === 0 ? 'acima do incluso'
                                  : `+${fmt(l, proj.perDay * 30)}/mês · limite em ~${proj.daysToQuota} dia(s)`}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="card-note">
              Usuários ativos = quem abriu o app neste mês (horário de Brasília). Tráfego de saída, chamadas de Edge Functions e
              e-mails não aparecem no banco: confira em Supabase → Settings → Usage.
            </p>
          </div>

          <PlanForm key={JSON.stringify(data.plan)} plan={data.plan} onSave={savePlan} />
        </>
      )}
    </div>
  );
}
