import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PLATFORMS, accountLabel, disconnectAccount, fetchAccounts, startConnect } from '../lib/marketing';
import { formatDate } from '../lib/userDetailHelpers';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

// Marketing → Contas conectadas: liga as redes da EAFIT por OAuth (Meta e
// Threads). A volta do login cai aqui com ?conectado=… ou ?erro=….
export default function MarketingAccounts() {
  const [params, setParams] = useSearchParams();
  const [accounts, setAccounts] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(() => {
    if (params.get('conectado')) return `Conectado: ${params.get('conectado')}`;
    if (params.get('erro')) return `Erro: ${params.get('erro')}`;
    return '';
  });

  const load = useCallback(async () => {
    try {
      setAccounts(await fetchAccounts());
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setAccounts([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Tira o resultado da URL para não reaparecer ao recarregar.
  useEffect(() => {
    if (params.get('conectado') || params.get('erro')) setParams({}, { replace: true });
  }, [params, setParams]);

  async function connect(provider) {
    setBusy(provider);
    setMsg('');
    try {
      await startConnect(provider);
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
      setBusy('');
    }
  }

  async function disconnect(a) {
    const extra = a.platform === 'facebook' && accounts.some(x => x.parent_id === a.id) ? ' O Instagram ligado a ela sai junto.' : '';
    if (!window.confirm(`Desconectar ${PLATFORMS[a.platform].label} ${accountLabel(a)}? Posts agendados para ela deixam de sair.${extra}`)) return;
    try {
      await disconnectAccount(a.id);
      setMsg(`Desconectado: ${accountLabel(a)}.`);
      await load();
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contas conectadas</h1>
          <p className="page-subtitle">
            Redes da EAFIT ligadas ao painel. O acesso fica guardado só no servidor, cifrado. Para conectar, entre com
            uma conta que seja admin da Página e tenha papel no app da Meta.
          </p>
        </div>
      </div>

      <section className="card stack">
        <h2 className="section-title">Conectar</h2>
        <div className="actions-row">
          <button type="button" className="btn btn--primary" disabled={!!busy} onClick={() => connect('meta')}>
            {busy === 'meta' ? 'Abrindo…' : 'Conectar Facebook e Instagram'}
          </button>
          <button type="button" className="btn" disabled={!!busy} onClick={() => connect('threads')}>
            {busy === 'threads' ? 'Abrindo…' : 'Conectar Threads'}
          </button>
        </div>
        <p className="user-detail__meta">
          Facebook e Instagram entram juntos: no login, marque a Página da EAFIT. O Instagram profissional ligado a ela
          aparece automaticamente. TikTok entra numa próxima etapa.
        </p>
        {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      </section>

      {!accounts && <Loading />}
      {accounts && accounts.length === 0 && <EmptyState icon="🔌" label="Nenhuma rede conectada ainda." />}
      {accounts && accounts.length > 0 && (
        <div className="table-wrap">
          <table className="resp-table">
            <thead>
              <tr><th>Rede</th><th>Conta</th><th>Situação</th><th>Conectada em</th><th>Comentários lidos</th><th /></tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id}>
                  <td data-label="Rede">{PLATFORMS[a.platform]?.label || a.platform}</td>
                  <td data-label="Conta">
                    <span className="mkt-account">
                      {a.picture_url && <img src={a.picture_url} alt="" className="mkt-avatar" />}
                      <span>
                        {a.name}
                        {a.username && <div className="user-detail__meta">@{a.username}</div>}
                      </span>
                    </span>
                  </td>
                  <td data-label="Situação">
                    {a.status === 'ok'
                      ? <span className="badge badge--ok">Ativa</span>
                      : <span className="badge badge--danger" title={a.status_detail || ''}>Reconectar</span>}
                    {a.token_expires_at && (
                      <div className="user-detail__meta">acesso renova sozinho · vence {formatDate(a.token_expires_at)}</div>
                    )}
                  </td>
                  <td data-label="Conectada em">{formatDate(a.connected_at)}</td>
                  <td data-label="Comentários lidos">{a.last_synced_at ? formatDate(a.last_synced_at) : 'ainda não'}</td>
                  <td data-label="">
                    <div className="actions-row">
                      {a.status !== 'ok' && (
                        <button type="button" className="btn btn--small" onClick={() => connect(a.platform === 'threads' ? 'threads' : 'meta')}>
                          Reconectar
                        </button>
                      )}
                      {!a.parent_id && (
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => disconnect(a)}>Desconectar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
