import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import { ALERT_RULES, LOG_LABELS, fetchDigestPage, saveRule, savePrefs, sendDigestToMe, trend } from '../lib/digest';

const fmtDateTime = iso => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

function Trend({ label, cur, prev }) {
  const t = trend(cur, prev);
  return (
    <div className="tile">
      <div className="tile__value">{t.value}</div>
      <div className="tile__label">
        {label} · {t.diff > 0 ? '+' : ''}{t.diff}{t.pct == null ? '' : ` (${t.pct > 0 ? '+' : ''}${t.pct}%)`} vs. semana anterior
      </div>
    </div>
  );
}

function RuleRow({ rule, onSaved }) {
  const [draft, setDraft] = useState({ enabled: rule.enabled, threshold: String(rule.threshold), cooldownHours: String(rule.cooldownHours) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const meta = ALERT_RULES[rule.key];
  const dirty = draft.enabled !== rule.enabled || Number(draft.threshold) !== rule.threshold || Number(draft.cooldownHours) !== rule.cooldownHours;

  async function save() {
    setBusy(true);
    setMsg('');
    try { await saveRule(rule.key, draft); onSaved(); setMsg('Salvo.'); } catch (err) { setMsg(`Erro: ${err.message}`); } finally { setBusy(false); }
  }

  return (
    <tr>
      <td data-label="Alerta">
        <label className="actions-row" style={{ gap: 6 }}>
          <input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} aria-label={`Ligar ${meta.label}`} />
          <strong>{meta.label}</strong>
        </label>
        <div className="user-detail__meta">{meta.hint}</div>
      </td>
      <td data-label="Agora">
        {rule.value == null ? '—' : <span className={rule.over ? 'badge badge--danger' : 'badge badge--ok'}>{rule.value}</span>}
        <div className="user-detail__meta">{rule.detail}</div>
      </td>
      <td data-label="Limite">
        <input className="input input--sm" type="number" min={0} style={{ maxWidth: 90 }} value={draft.threshold} aria-label={`Limite de ${meta.label}`} onChange={e => setDraft({ ...draft, threshold: e.target.value })} />
        <div className="user-detail__meta">{meta.unit}</div>
      </td>
      <td data-label="Repetir após">
        <input className="input input--sm" type="number" min={1} max={168} style={{ maxWidth: 80 }} value={draft.cooldownHours} aria-label={`Repetição de ${meta.label}`} onChange={e => setDraft({ ...draft, cooldownHours: e.target.value })} /> h
      </td>
      <td data-label="Último disparo">{fmtDateTime(rule.lastFiredAt)}</td>
      <td data-label="">
        <button type="button" className="btn btn--small" disabled={busy || !dirty} onClick={save}>Salvar</button>
        {msg && <div className={msg.startsWith('Erro') ? 'form-msg form-msg--error' : 'user-detail__meta'}>{msg}</div>}
      </td>
    </tr>
  );
}

// Sistema → Relatórios e alertas.
export default function DigestAlerts() {
  const { adminUser } = useAdminAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    fetchDigestPage(adminUser?.id).then(d => { setData(d); setError(''); }).catch(err => setError(err.message));
  }, [adminUser?.id]);
  useEffect(() => { load(); }, [load]);

  async function togglePref(key) {
    const next = { ...data.prefs, [key]: !data.prefs[key] };
    setData({ ...data, prefs: next });
    try { await savePrefs(adminUser?.id, next); } catch (err) { setError(err.message); load(); }
  }

  async function sendMe() {
    setSending(true);
    setMsg('');
    try {
      const r = await sendDigestToMe();
      setMsg(r.sent ? `Relatório enviado para ${adminUser?.email}.` : 'O e-mail não saiu (veja os secrets de e-mail das funções).');
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  if (error) return <p className="form-msg form-msg--error">{error}</p>;
  if (!data) return <Loading />;
  const p = data.preview;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatórios e alertas</h1>
          <p className="page-subtitle">
            Toda segunda às 8h os admins recebem por e-mail o resumo da semana. De hora em hora o sistema confere os alertas
            abaixo e avisa por e-mail e push quando algum passa do limite.
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">O que eu recebo</h2>
        <div className="actions-row">
          <label className="actions-row" style={{ gap: 6 }}>
            <input type="checkbox" checked={data.prefs.weeklyDigest} onChange={() => togglePref('weeklyDigest')} />
            <span>Relatório semanal por e-mail</span>
          </label>
          <label className="actions-row" style={{ gap: 6 }}>
            <input type="checkbox" checked={data.prefs.alerts} onChange={() => togglePref('alerts')} />
            <span>Alertas (e-mail e push)</span>
          </label>
        </div>
        <p className="card-note">Vale só para a sua conta ({adminUser?.email}). Cada admin escolhe o seu.</p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="section-title" style={{ margin: 0 }}>Prévia do relatório (últimos 7 dias)</h2>
          <button type="button" className="btn btn--small" disabled={sending} onClick={sendMe}>{sending ? 'Enviando…' : 'Enviar para mim agora'}</button>
        </div>
        {msg && <p className={msg.startsWith('Erro') ? 'form-msg form-msg--error' : 'form-msg'}>{msg}</p>}
        <div className="tile-grid">
          <Trend label="cadastros" cur={p.signups} prev={p.signups_prev} />
          <Trend label="pessoas treinaram" cur={p.trained} prev={p.trained_prev} />
          <Trend label="dias de treino" cur={p.workouts} prev={p.workouts_prev} />
          <Trend label="erros do app" cur={p.errors} prev={p.errors_prev} />
          <div className="tile"><div className="tile__value">{p.support_open ?? 0}</div><div className="tile__label">suporte aberto ({p.support_late ?? 0} há mais de 48 h)</div></div>
          <div className="tile"><div className="tile__value">{p.risk_high ?? 0}</div><div className="tile__label">risco alto de abandono</div></div>
          {p.nps_answers > 0 && <div className="tile"><div className="tile__value">{p.nps}</div><div className="tile__label">NPS da semana ({p.nps_answers} respostas)</div></div>}
        </div>
        {p.new_errors?.length > 0 && (
          <p className="card-note"><strong>Erros novos:</strong> {p.new_errors.map(e => `“${e.message}” (${e.n}×)`).join('; ')}</p>
        )}
        {p.partners?.length > 0 && (
          <p className="card-note"><strong>Parceiros em destaque:</strong> {p.partners.map(x => `${x.name} (${x.n})`).join(', ')}</p>
        )}
      </div>

      <div className="card">
        <h2 className="section-title">Alertas</h2>
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Alerta</th><th>Agora</th><th>Limite</th><th>Repetir após</th><th>Último disparo</th><th /></tr></thead>
            <tbody>{data.rules.map(r => <RuleRow key={`${r.key}-${r.threshold}-${r.cooldownHours}-${r.enabled}`} rule={r} onSaved={load} />)}</tbody>
          </table>
        </div>
        <p className="card-note">“Repetir após”: depois de avisar, o mesmo alerta só volta a avisar passado esse tempo, mesmo que continue acima do limite.</p>
      </div>

      <div className="card">
        <h2 className="section-title">Histórico</h2>
        {data.log.length === 0 ? <p className="card-note" style={{ marginTop: 0 }}>Nenhum alerta ou relatório enviado ainda.</p> : (
          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Quando</th><th>O quê</th><th>Detalhe</th><th>Avisados</th></tr></thead>
              <tbody>
                {data.log.map(l => (
                  <tr key={l.id}>
                    <td data-label="Quando">{fmtDateTime(l.created_at)}</td>
                    <td data-label="O quê">{LOG_LABELS[l.key] || l.key}</td>
                    <td data-label="Detalhe">{l.detail}</td>
                    <td data-label="Avisados">{l.notified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
