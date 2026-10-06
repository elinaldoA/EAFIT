import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  WEEKDAY_LABELS, renderTemplate, countByKind, describeSchedule, fetchRules, saveRule, fetchLog,
  fetchPreview, previewMessage,
} from '../lib/autoNotifications';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';

function RuleCard({ rule, stats, onSaved }) {
  const saved = rule;
  const [draft, setDraft] = useState(rule);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState(null); // null | { loading } | { rows } | { error }

  const dirty = ['enabled', 'send_hour', 'cooldown_days', 'title', 'body'].some(k => draft[k] !== rule[k])
    || JSON.stringify(draft.weekdays || []) !== JSON.stringify(rule.weekdays || []);

  function toggleDay(d) {
    const current = draft.weekdays || [];
    const next = current.includes(d) ? current.filter(x => x !== d) : [...current, d];
    setDraft({ ...draft, weekdays: next.length ? next.sort((a, b) => a - b) : null });
  }

  async function handleSave() {
    setBusy(true);
    setMsg('');
    try {
      await saveRule(rule.kind, {
        enabled: draft.enabled,
        send_hour: Number(draft.send_hour),
        weekdays: draft.weekdays,
        cooldown_days: Number(draft.cooldown_days),
        title: draft.title.trim(),
        body: draft.body.trim(),
      });
      setMsg('Salvo.');
      await onSaved();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    setPreview({ loading: true });
    try {
      setPreview({ rows: await fetchPreview(rule.kind) });
    } catch (err) {
      setPreview({ error: err.message });
    }
  }

  const valid = draft.title.trim() && draft.body.trim() && Number(draft.cooldown_days) >= 1;

  return (
    <div className="card stack" style={{ gap: 14 }}>
      <div className="card-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>
            {rule.label}
            <span className={`badge ${draft.enabled ? 'badge--ok' : 'badge--warning'}`}>{draft.enabled ? 'ativa' : 'pausada'}</span>
          </h2>
          <p className="user-detail__meta" style={{ margin: '4px 0 0' }}>{rule.description}</p>
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />
          <span>Ativa</span>
        </label>
      </div>

      {rule.per_user_hour && (
        <p className="user-detail__meta" style={{ margin: 0 }}>
          ⏰ Quem definiu o horário preferido de treino no app recebe 1h antes dele. O horário abaixo vale só para quem não definiu.
        </p>
      )}

      <div className="form-grid">
        <label className="field">
          <span className="field__label">Horário de envio (Brasília)</span>
          <select className="input" value={draft.send_hour} onChange={e => setDraft({ ...draft, send_hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Intervalo mínimo entre envios (dias)</span>
          <input
            className="input" type="number" min="1" max="90" value={draft.cooldown_days}
            onChange={e => setDraft({ ...draft, cooldown_days: e.target.value })}
          />
        </label>
        <div className="field">
          <span className="field__label">Dias da semana (nenhum marcado = todos)</span>
          <div className="seg" role="group" aria-label="Dias da semana">
            {WEEKDAY_LABELS.map((label, d) => (
              <button
                key={d} type="button" aria-pressed={!!draft.weekdays?.includes(d)}
                className={`seg__btn${draft.weekdays?.includes(d) ? ' seg__btn--active' : ''}`}
                onClick={() => toggleDay(d)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="field">
        <span className="field__label">Título</span>
        <input className="input" maxLength={80} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
      </label>
      <label className="field">
        <span className="field__label">Mensagem — variáveis: {rule.variables}</span>
        <textarea className="input" rows={2} maxLength={200} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} />
      </label>

      <div className="push-preview" aria-label="Pré-visualização">
        <div className="push-preview__title">{renderTemplate(draft.title) || '—'}</div>
        <div className="push-preview__body">{renderTemplate(draft.body) || '—'}</div>
        <div className="push-preview__meta">Prévia com dados de exemplo · {describeSchedule({ ...draft, send_hour: Number(draft.send_hour) })}</div>
      </div>

      <div>
        <button className="btn btn--small" onClick={handlePreview} disabled={preview?.loading}>
          {preview?.loading ? 'Consultando…' : 'Ver quem receberia agora'}
        </button>
        {preview?.error && <p className="form-msg form-msg--error" style={{ marginTop: 8 }}>Erro: {preview.error}</p>}
        {preview?.rows && (
          <div style={{ marginTop: 10 }}>
            {!saved.enabled && <p className="form-msg form-msg--error">Esta regra está pausada: nada é enviado enquanto estiver pausada.</p>}
            {preview.rows.length === 0 ? (
              <p className="card-note" style={{ marginTop: 0 }}>
                Ninguém se encaixa agora (critério da regra, intervalo mínimo, limite de 1 por dia ou sem push ativo).
                Com poucos usuários com push, é normal.
              </p>
            ) : (
              <>
                <p className="user-detail__meta" style={{ margin: '0 0 6px' }}>
                  {preview.rows.length} pessoa(s) receberia(m) no horário configurado. A lista ignora horário e dia da semana.
                </p>
                <ul className="preview-list">
                  {preview.rows.slice(0, 20).map(c => {
                    const m = previewMessage(draft, c);
                    return (
                      <li key={c.user_id}>
                        <strong>{c.email}</strong>
                        <div>{m.title} — {m.body}</div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card-head" style={{ marginBottom: 0 }}>
        <span className="user-detail__meta">
          Enviadas: <strong>{stats?.d7 ?? 0}</strong> nos últimos 7 dias · <strong>{stats?.d30 ?? 0}</strong> nos últimos 30
        </span>
        <div className="actions-row">
          {msg && <span className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</span>}
          <button className="btn btn--ghost btn--small" disabled={busy || !dirty} onClick={() => { setDraft(rule); setMsg(''); }}>Desfazer</button>
          <button className="btn btn--primary btn--small" disabled={busy || !dirty || !valid} onClick={handleSave}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

export default function AutoNotifications() {
  const [rules, setRules] = useState([]);
  const [log, setLog] = useState({ rows: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, l] = await Promise.all([fetchRules(), fetchLog()]);
      setRules(r);
      setLog(l);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (error) return <p className="form-msg form-msg--error">{error}</p>;

  const stats = countByKind(log.rows);
  const labelByKind = Object.fromEntries(rules.map(r => [r.kind, r.label]));
  const total7 = Object.values(stats).reduce((a, s) => a + s.d7, 0);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notificações automáticas</h1>
          <p className="page-subtitle">
            Mensagens enviadas pelo sistema para estimular o uso do app. Só vão para quem tem push ativo e não
            desligou "Lembretes e incentivos"; cada pessoa recebe no máximo uma por dia. Para um envio manual,
            use <Link to="/notificacoes">Notificações</Link>.
          </p>
        </div>
        <span className="badge badge--admin">{total7} enviadas em 7 dias</span>
      </div>

      {rules.map(rule => (
        <RuleCard key={`${rule.kind}-${rule.updated_at}`} rule={rule} stats={stats[rule.kind]} onSaved={load} />
      ))}

      <div className="card">
        <h2 className="section-title">Últimos envios</h2>
        {!log.recent.length ? <p className="card-note">Nenhum envio automático registrado ainda.</p> : (
          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Quando</th><th>Tipo</th><th>Mensagem</th><th></th></tr></thead>
              <tbody>
                {log.recent.map(n => (
                  <tr key={n.id}>
                    <td data-label="Quando">{formatDate(n.created_at)}</td>
                    <td data-label="Tipo">{labelByKind[n.kind] || n.kind}</td>
                    <td data-label="Mensagem">{n.title}</td>
                    <td data-label=""><Link className="btn btn--ghost btn--small" to={`/users/${n.user_id}`}>Ver usuário</Link></td>
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
