import { useCallback, useEffect, useState } from 'react';
import { evaluateJobs, summarizeHttp, fetchHealth, formatBytes } from '../lib/health';
import { mapStorage, PURGE_DAYS, fetchPurgeStats, purgeOld } from '../lib/ops';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';

const STATE_BADGE = { ok: 'badge--ok', warn: 'badge--warning', bad: 'badge--danger' };
const STATE_LABEL = { ok: 'ok', warn: 'atenção', bad: 'problema' };

function StateBadge({ state }) {
  return <span className={`badge ${STATE_BADGE[state]}`}>{STATE_LABEL[state]}</span>;
}

function BlockError({ message }) {
  return <p className="form-msg form-msg--error">Não foi possível carregar: {message}</p>;
}

// Limpeza de dados técnicos antigos (métricas e controle de envio). Carrega
// sozinha: se a consulta falhar, o bloco não aparece.
function PurgeCard() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    Promise.resolve().then(() => fetchPurgeStats()).then(setRows).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handlePurge(r) {
    if (!window.confirm(`Apagar ${r.old.toLocaleString('pt-BR')} registro(s) de "${r.label}" com mais de ${PURGE_DAYS} dias? Não dá para desfazer.`)) return;
    setBusy(r.kind);
    setMsg('');
    try {
      const removed = await purgeOld(r.kind);
      setMsg(`${removed.toLocaleString('pt-BR')} registro(s) apagado(s).`);
      load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy('');
    }
  }

  if (!rows) return null;

  return (
    <div className="card">
      <h2 className="section-title">Dados antigos</h2>
      <div className="table-wrap">
        <table className="resp-table">
          <thead><tr><th>Tipo</th><th>Registros</th><th>Com mais de {PURGE_DAYS} dias</th><th /></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.kind}>
                <td data-label="Tipo">{r.label}</td>
                <td data-label="Registros">{r.total.toLocaleString('pt-BR')}</td>
                <td data-label={`Com mais de ${PURGE_DAYS} dias`}>{r.old.toLocaleString('pt-BR')}</td>
                <td data-label="">
                  <button className="btn btn--small" disabled={r.old === 0 || busy === r.kind} onClick={() => handlePurge(r)}>Limpar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`} style={{ marginTop: 12 }}>{msg}</p>}
      <p className="card-note">
        Métricas de uso e controle de envio, que crescem sem parar. Nada aqui é conteúdo criado pelo usuário
        (treinos, peso, fotos). Depois de limpar, o período "Todos" de Comportamento e do funil do Dashboard passa a
        cobrir só os últimos {PURGE_DAYS} dias; os períodos de 7, 30 e 90 dias não mudam.
      </p>
    </div>
  );
}

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setHealth(await fetchHealth());
    setUpdatedAt(new Date());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  if (!health) return <Loading />;

  const jobs = health.cron.data ? evaluateJobs(health.cron.data) : [];
  const http = health.http.data ? summarizeHttp(health.http.data) : null;
  const httpHistory = http && http.state === 'warn' && http.failed > 0;
  const push = health.push.data?.[0];
  const overdue = health.overdue.data || 0;
  const usage = health.usage.data || [];
  const total = usage.find(u => u.table_name === '__total__');
  const tables = usage.filter(u => u.table_name !== '__total__');
  const maxSize = Math.max(1, ...tables.map(t => Number(t.size_bytes)));
  const buckets = mapStorage(health.storage?.data);
  const storageTotal = buckets.reduce((n, b) => n + b.bytes, 0);
  const maxBucket = Math.max(1, ...buckets.map(b => b.bytes));

  const problems = [
    ...jobs.filter(j => j.state === 'bad').map(j => `${j.label}: ${j.reason}`),
    ...(http?.state === 'bad' ? [`${http.recentFailed} chamada(s) das funções com erro na última hora`] : []),
    ...(overdue > 0 ? [`${overdue} notificação(ões) agendada(s) atrasada(s)`] : []),
  ];
  const warnings = [
    ...jobs.filter(j => j.state === 'warn').map(j => `${j.label}: ${j.reason}`),
    ...(httpHistory ? [`${http.failed} chamada(s) das funções com erro antigo (mais de 1h) — só histórico`] : []),
  ];
  const pushRate = push && Number(push.total_users) > 0
    ? Math.round((Number(push.users_with_push) / Number(push.total_users)) * 100) : null;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Saúde do sistema</h1>
          <p className="page-subtitle">Jobs agendados, envio de notificações, alcance do push e uso do banco e dos arquivos. Atualiza a cada minuto.</p>
        </div>
        <div className="actions-row">
          {updatedAt && <span className="user-detail__meta">Atualizado às {updatedAt.toLocaleTimeString('pt-BR')}</span>}
          <button className="btn btn--small" onClick={load} disabled={refreshing}>{refreshing ? 'Atualizando…' : 'Atualizar'}</button>
        </div>
      </div>

      <div className={`card health-banner health-banner--${problems.length ? 'bad' : warnings.length ? 'warn' : 'ok'}`}>
        {problems.length ? (
          <>
            <strong>{problems.length} problema(s) encontrado(s)</strong>
            <ul>{problems.map(p => <li key={p}>{p}</li>)}</ul>
          </>
        ) : warnings.length ? (
          <>
            <strong>Nenhum problema, mas há avisos</strong>
            <ul>{warnings.map(p => <li key={p}>{p}</li>)}</ul>
          </>
        ) : (
          <strong>Tudo funcionando.</strong>
        )}
      </div>

      <div className="card">
        <h2 className="section-title">Jobs agendados</h2>
        {health.cron.error ? <BlockError message={health.cron.error} /> : (
          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Job</th><th>Estado</th><th>Última execução</th><th>Execuções (24h)</th><th>Falhas (24h)</th></tr></thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.name}>
                    <td data-label="Job">
                      {j.label}
                      <div className="user-detail__meta">{j.name}{j.job ? ` · ${j.job.schedule}` : ''}</div>
                    </td>
                    <td data-label="Estado"><StateBadge state={j.state} /> <span className="user-detail__meta">{j.reason}</span></td>
                    <td data-label="Última execução">{j.job?.last_run_at ? formatDate(j.job.last_run_at) : '—'}</td>
                    <td data-label="Execuções (24h)">{j.job?.runs_24h ?? '—'}</td>
                    <td data-label="Falhas (24h)">{j.job?.failures_24h ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {overdue > 0 && (
          <p className="form-msg form-msg--error" style={{ marginTop: 12 }}>
            {overdue} notificação(ões) agendada(s) passou(aram) do horário há mais de 10 minutos sem serem enviadas.
          </p>
        )}
      </div>

      <div className="two-col">
        <div className="card">
          <h2 className="section-title">Respostas das funções (cron → Edge Functions)</h2>
          {health.http.error ? <BlockError message={health.http.error} /> : !health.http.data.length ? (
            <p className="card-note">Sem respostas registradas nas últimas horas.</p>
          ) : (
            <>
              <p style={{ margin: '0 0 10px' }}>
                <StateBadge state={http.state} /> {http.ok} de {http.total} chamada(s) com sucesso
                {httpHistory && <span className="user-detail__meta"> · erros só de mais de 1h atrás</span>}
              </p>
              <div className="table-wrap">
                <table className="resp-table">
                  <thead><tr><th>Resposta</th><th>Qtd.</th><th>Última</th></tr></thead>
                  <tbody>
                    {health.http.data.map(r => (
                      <tr key={r.status_group}>
                        <td data-label="Resposta">
                          {r.status_group}
                          {r.status_group !== '2xx' && r.sample && <div className="user-detail__meta">{r.sample}</div>}
                        </td>
                        <td data-label="Qtd.">{r.total}</td>
                        <td data-label="Última">{formatDate(r.last_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="card-note">
            O banco guarda essas respostas por poucas horas. 401 indica segredo do cron divergente; 5xx, erro dentro da função.
          </p>
        </div>

        <div className="card">
          <h2 className="section-title">Alcance do push</h2>
          {health.push.error ? <BlockError message={health.push.error} /> : push && (
            <>
              <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                <div className="tile"><div className="tile__value">{push.users_with_push}</div><div className="tile__label">usuários com push ativo</div></div>
                <div className="tile"><div className="tile__value">{pushRate === null ? '—' : `${pushRate}%`}</div><div className="tile__label">da base (de {push.total_users})</div></div>
                <div className="tile"><div className="tile__value">{push.subs_total}</div><div className="tile__label">dispositivos inscritos</div></div>
              </div>
              <ul className="dist" style={{ marginTop: 14 }}>
                {Object.entries(push.hosts || {}).sort((a, b) => b[1] - a[1]).map(([host, n]) => (
                  <li key={host} className="dist__row">
                    <span className="dist__label" title={host}>{host.replace(/^(fcm\.googleapis\.com)$/, 'Chrome / Android')}</span>
                    <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(2, (n / push.subs_total) * 100)}%` }} /></span>
                    <span className="dist__value">{n}</span>
                  </li>
                ))}
              </ul>
              <p className="card-note">Quem não tem push ativo não recebe nenhuma notificação automática.</p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">Notificações automáticas</h2>
        {health.notifications.error ? <BlockError message={health.notifications.error} /> : (
          <div className="table-wrap">
            <table className="resp-table">
              <thead><tr><th>Tipo</th><th>Situação</th><th>Horário</th><th>Último envio</th><th>24h</th><th>7 dias</th></tr></thead>
              <tbody>
                {health.notifications.data.map(n => (
                  <tr key={n.kind}>
                    <td data-label="Tipo">{n.label}</td>
                    <td data-label="Situação"><span className={`badge ${n.enabled ? 'badge--ok' : 'badge--warning'}`}>{n.enabled ? 'ativa' : 'pausada'}</span></td>
                    <td data-label="Horário">{String(n.send_hour).padStart(2, '0')}:00</td>
                    <td data-label="Último envio">{n.last_sent_at ? formatDate(n.last_sent_at) : 'nunca'}</td>
                    <td data-label="24h">{n.sent_24h}</td>
                    <td data-label="7 dias">{n.sent_7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="card-note">
          "Nunca" ou 0 em uma regra ativa pode ser normal (ninguém se encaixou no critério) — o que importa é o job
          de engajamento estar executando sem falhas.
        </p>
      </div>

      <div className="card">
        <h2 className="section-title">Banco de dados</h2>
        {health.usage.error ? <BlockError message={health.usage.error} /> : (
          <>
            <p style={{ margin: '0 0 12px' }}>Tamanho total: <strong>{formatBytes(total?.size_bytes)}</strong></p>
            <ul className="dist">
              {tables.map(t => (
                <li key={t.table_name} className="dist__row" style={{ gridTemplateColumns: '160px 1fr auto' }}>
                  <span className="dist__label" title={t.table_name}>{t.table_name}</span>
                  <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(2, (Number(t.size_bytes) / maxSize) * 100)}%` }} /></span>
                  <span className="dist__value">{formatBytes(t.size_bytes)} · ~{Number(t.est_rows).toLocaleString('pt-BR')} linhas</span>
                </li>
              ))}
            </ul>
            <p className="card-note">Maiores tabelas do schema público. Contagem de linhas é estimada.</p>
          </>
        )}
      </div>

      {health.storage && (
        <div className="card">
          <h2 className="section-title">Arquivos (Storage)</h2>
          {health.storage.error ? <BlockError message={health.storage.error} /> : !buckets.length ? (
            <p className="card-note" style={{ marginTop: 0 }}>Nenhum bucket encontrado.</p>
          ) : (
            <>
              <p style={{ margin: '0 0 12px' }}>Tamanho total: <strong>{formatBytes(storageTotal)}</strong></p>
              <ul className="dist">
                {buckets.map(b => (
                  <li key={b.bucket} className="dist__row" style={{ gridTemplateColumns: '160px 1fr auto' }}>
                    <span className="dist__label" title={b.bucket}>{b.bucket}</span>
                    <span className="dist__track"><span className="dist__fill" style={{ width: `${Math.max(2, (b.bytes / maxBucket) * 100)}%` }} /></span>
                    <span className="dist__value">
                      {formatBytes(b.bytes)} · {b.objects.toLocaleString('pt-BR')} arquivo(s) · {b.isPublic ? 'público' : 'privado'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="card-note">
                Fotos de progresso e mídias de exercício ficam aqui e não entram no tamanho do banco. O plano do
                Supabase tem um limite próprio para arquivos.
              </p>
            </>
          )}
        </div>
      )}

      <PurgeCard />
    </div>
  );
}
