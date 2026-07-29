import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { useAdminAuth } from '../context/AdminAuthContext';
import { fetchUsers } from './UsersList';
import EmptyState from '../components/EmptyState';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

// datetime-local não aceita segundos/timezone — formata pro fuso local do
// navegador do admin, que é o de referência aqui (não o do usuário alvo).
function toLocalInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Broadcast() {
  const { adminUser } = useAdminAuth();
  const [users, setUsers] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [scheduleAt, setScheduleAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState([]);
  const [pending, setPending] = useState([]);

  const loadExtras = useCallback(async () => {
    const [{ data: hist }, { data: sched }] = await Promise.all([
      db.from('admin_audit_log').select('id, created_at, details')
        .eq('action', 'broadcastPush').order('created_at', { ascending: false }).limit(20),
      db.from('scheduled_broadcasts').select('id, title, body, scheduled_at, target_user_ids')
        .is('sent_at', null).order('scheduled_at', { ascending: true }),
    ]);
    setHistory(hist || []);
    setPending(sched || []);
  }, []);

  useEffect(() => {
    fetchUsers().then(setUsers).catch(() => {});
    loadExtras().catch(() => {});
  }, [loadExtras]);

  function toggleUser(id) {
    setSelectedIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (scope === 'specific' && selectedIds.length === 0) {
      setMsg('Erro: selecione ao menos um usuário.');
      return;
    }
    const isScheduled = !!scheduleAt;
    const scheduledDate = isScheduled ? new Date(scheduleAt) : null;
    if (isScheduled && scheduledDate <= new Date()) {
      setMsg('Erro: o agendamento precisa ser num horário futuro.');
      return;
    }

    if (!window.confirm(
      isScheduled
        ? `Agendar notificação para ${formatDate(scheduledDate)}, ${scope === 'all' ? 'TODOS os usuários' : `${selectedIds.length} usuário(s) selecionado(s)`}?`
        : (scope === 'all' ? 'Enviar notificação para TODOS os usuários?' : `Enviar notificação para ${selectedIds.length} usuário(s) selecionado(s)?`)
    )) return;

    setBusy(true);
    setMsg('');
    try {
      if (isScheduled) {
        const { error } = await db.from('scheduled_broadcasts').insert({
          title, body,
          target_user_ids: scope === 'specific' ? selectedIds : null,
          scheduled_at: scheduledDate.toISOString(),
          created_by: adminUser.id,
        });
        if (error) throw error;
        setMsg('Notificação agendada.');
        await loadExtras();
      } else {
        const { data, error } = await db.functions.invoke('admin-broadcast', {
          body: { title, body, targetUserIds: scope === 'specific' ? selectedIds : undefined },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setMsg(`Enviado: ${data.sent} de ${data.targetCount} dispositivo(s).`);
        await loadExtras();
      }
      setTitle('');
      setBody('');
      setSelectedIds([]);
      setScheduleAt('');
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function cancelScheduled(id) {
    if (!window.confirm('Cancelar esta notificação agendada?')) return;
    const { error } = await db.from('scheduled_broadcasts').delete().eq('id', id);
    if (!error) await loadExtras();
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title">Notificações</h1>
      </div>

      <form className="card stack" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Título</span>
          <input className="input" required value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Mensagem</span>
          <input className="input" required value={body} onChange={e => setBody(e.target.value)} />
        </label>

        <div className="field">
          <span className="field__label">Destinatários</span>
          <div className="actions-row">
            <label><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /> Todos os usuários</label>
            <label><input type="radio" checked={scope === 'specific'} onChange={() => setScope('specific')} /> Selecionar usuários</label>
          </div>
        </div>

        {scope === 'specific' && (
          <div className="card" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {users.map(u => (
              <label key={u.id} style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
                <input type="checkbox" checked={selectedIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                {u.email}
              </label>
            ))}
          </div>
        )}

        <label className="field">
          <span className="field__label">Agendar para (deixe em branco pra enviar agora)</span>
          <input
            className="input" type="datetime-local" value={scheduleAt}
            min={toLocalInputValue(new Date())}
            onChange={e => setScheduleAt(e.target.value)}
          />
        </label>

        {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? 'Enviando…' : (scheduleAt ? 'Agendar notificação' : 'Enviar notificação agora')}
        </button>
      </form>

      <section>
        <h2 className="section-title">Agendadas</h2>
        {pending.length === 0 && <EmptyState icon="🗓️" label="Nenhuma notificação agendada." />}
        {pending.length > 0 && (
          <table className="resp-table">
            <thead><tr><th>Quando</th><th>Título</th><th>Destinatários</th><th></th></tr></thead>
            <tbody>
              {pending.map(p => (
                <tr key={p.id}>
                  <td data-label="Quando">{formatDate(p.scheduled_at)}</td>
                  <td data-label="Título">{p.title}</td>
                  <td data-label="Destinatários">{p.target_user_ids?.length ? `${p.target_user_ids.length} selecionado(s)` : 'Todos'}</td>
                  <td data-label=""><button className="btn btn--ghost btn--small" onClick={() => cancelScheduled(p.id)}>Cancelar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="section-title">Histórico de envios (últimos 20)</h2>
        {history.length === 0 && <EmptyState icon="🔔" label="Nenhuma notificação enviada ainda." />}
        {history.length > 0 && (
          <table className="resp-table">
            <thead><tr><th>Quando</th><th>Título</th><th>Mensagem</th><th>Enviadas</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td data-label="Quando">{formatDate(h.created_at)}</td>
                  <td data-label="Título">{h.details?.title || '—'}</td>
                  <td data-label="Mensagem">{h.details?.body || '—'}</td>
                  <td data-label="Enviadas">{h.details?.sent ?? '—'} / {h.details?.targetCount ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
