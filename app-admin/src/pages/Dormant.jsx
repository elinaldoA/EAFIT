import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DAY_OPTIONS, DEFAULT_MESSAGE, defaultSelection, fetchDormant, fetchDormantRule, sendToDormant,
  setDormantRuleEnabled, summarize,
} from '../lib/dormant';
import { describeSchedule } from '../lib/autoNotifications';
import { emailResult } from '../lib/broadcastResult';
import { formatDate } from '../lib/userDetailHelpers';
import { useAdminAccess } from '../context/useAdminAccess';
import MessageEditor from '../components/MessageEditor';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

const fmtDay = d => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : 'nunca');

// Comunicação → Sumidos: quem parou de treinar e de abrir o app, com envio
// manual (push + e-mail) e o liga/desliga do envio automático (regra 'dormant').
export default function Dormant() {
  const canSend = useAdminAccess().can('notifications');
  const [days, setDays] = useState(7);
  const [people, setPeople] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState('');
  const [rule, setRule] = useState(undefined); // undefined = carregando, null = migration pendente
  const [title, setTitle] = useState(DEFAULT_MESSAGE.title);
  const [body, setBody] = useState(DEFAULT_MESSAGE.body);
  const [alsoEmail, setAlsoEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async minDays => {
    setPeople(null);
    setError('');
    try {
      const list = await fetchDormant(minDays);
      setPeople(list);
      setSelected(defaultSelection(list));
    } catch (err) {
      setError(err.message);
      setPeople([]);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);
  useEffect(() => { fetchDormantRule().then(setRule).catch(() => setRule(null)); }, []);

  const all = useMemo(() => summarize(people || []), [people]);
  const chosen = useMemo(() => summarize(people || [], selected), [people, selected]);

  function toggle(id) {
    setSelected(sel => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (!title.trim() || !body.trim()) { setMsg('Erro: preencha título e mensagem.'); return; }
    if (!selected.size) { setMsg('Erro: selecione ao menos uma pessoa.'); return; }
    const channels = alsoEmail ? `push para ${chosen.push} e e-mail para até ${chosen.email}` : `push para ${chosen.push}`;
    if (!window.confirm(`Enviar para ${selected.size} pessoa(s) sumida(s)? (${channels})`)) return;
    setBusy(true);
    setMsg('');
    try {
      const data = await sendToDormant({ ids: [...selected], title: title.trim(), body: body.trim(), email: alsoEmail });
      setMsg(`Enviado: push em ${data.sent} de ${data.targetCount} dispositivo(s).${emailResult(data)}`);
      await load(days);
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule() {
    const next = !rule.enabled;
    if (next && !window.confirm('Ligar o envio automático? Quem tem push ativo e está de 7 a 60 dias sumido passa a receber, no máximo uma vez por semana.')) return;
    try {
      await setDormantRuleEnabled(next);
      setRule({ ...rule, enabled: next });
    } catch (err) {
      setMsg(`Erro: ${err.message}`);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sumidos</h1>
          <p className="page-subtitle">
            Quem está sem treinar e sem abrir o app há {days} dias ou mais (contas com mais de {days} dias; admins e
            contas suspensas ficam de fora). O push só chega a quem ativou as notificações no app; o e-mail, a quem
            aceita novidades.
          </p>
        </div>
        <label className="field">
          <span className="field__label">Sumidos há</span>
          <select className="input" value={days} onChange={e => setDays(Number(e.target.value))}>
            {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}+ dias</option>)}
          </select>
        </label>
      </div>

      {people && !error && (
        <div className="tile-grid">
          <div className="tile"><div className="tile__value">{all.total}</div><div className="tile__label">pessoas sumidas</div></div>
          <div className="tile"><div className="tile__value">{all.push}</div><div className="tile__label">com push ativo</div></div>
          <div className="tile"><div className="tile__value">{all.email}</div><div className="tile__label">aceitam e-mail</div></div>
          <div className="tile"><div className="tile__value">{all.none}</div><div className="tile__label">sem canal (só a caixa do app)</div></div>
        </div>
      )}

      <section className="card stack">
        <h2 className="section-title">Envio automático</h2>
        {rule === undefined && <Loading />}
        {rule === null && <p className="form-msg form-msg--error">Regra automática indisponível (migration pendente).</p>}
        {rule && (
          <>
            <p>
              <strong>{rule.enabled ? 'Ligado' : 'Desligado'}</strong>
              {' · '}push {describeSchedule(rule)}, no máximo a cada {rule.cooldown_days} dias por pessoa, para quem está
              de 7 a 60 dias sumido e tem push ativo.
            </p>
            <p className="user-detail__meta">
              Texto: “{rule.title}” — “{rule.body}”. O e-mail automático já sai pelo e-mail semanal de segunda (convite
              para voltar até 4 semanas parado e, depois, a pesquisa <Link to="/inatividade">Por que pararam</Link>).
            </p>
            <div className="actions-row">
              <button type="button" className={`btn ${rule.enabled ? 'btn--ghost' : 'btn--primary'}`} disabled={!canSend} onClick={toggleRule}>
                {rule.enabled ? 'Desligar envio automático' : 'Ligar envio automático'}
              </button>
              <Link className="btn btn--ghost" to="/automacoes">Editar texto e horário</Link>
            </div>
          </>
        )}
      </section>

      <section className="card stack">
        <h2 className="section-title">Envio manual</h2>
        <MessageEditor title={title} body={body} onTitle={setTitle} onBody={setBody} email={alsoEmail} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <input type="checkbox" checked={alsoEmail} onChange={e => setAlsoEmail(e.target.checked)} />
          <span>Enviar também por e-mail <span className="field__label">(alcança quem não tem push)</span></span>
        </label>
        <div className="actions-row">
          <button type="button" className="btn btn--primary" disabled={busy || !canSend || !selected.size} onClick={handleSend}>
            {busy ? 'Enviando…' : `Enviar para ${selected.size} selecionado(s)`}
          </button>
          <span className="user-detail__meta">
            Selecionados: push {chosen.push} · e-mail {alsoEmail ? chosen.email : 0}
          </span>
        </div>
        {msg && <p className={`form-msg ${msg.startsWith('Erro') ? 'form-msg--error' : 'form-msg--ok'}`}>{msg}</p>}
      </section>

      {!people && <Loading />}
      {error && <p className="form-msg form-msg--error">{error}</p>}
      {people && !error && people.length === 0 && <EmptyState icon="🎉" label="Ninguém sumido nesse período." />}

      {people && people.length > 0 && (
        <div className="table-wrap">
          <table className="resp-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox" aria-label="Selecionar todos"
                    checked={selected.size === people.length}
                    onChange={() => setSelected(selected.size === people.length ? new Set() : new Set(people.map(p => p.id)))}
                  />
                </th>
                <th>Quem</th><th>Sumido há</th><th>Último treino</th><th>Último acesso</th><th>Canais</th><th>Último aviso</th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => (
                <tr key={p.id}>
                  <td data-label="">
                    <input type="checkbox" aria-label={`Selecionar ${p.email}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td data-label="Quem">
                    <Link to={`/users/${p.id}`}>{p.name || p.email}</Link>
                    {p.name && <div className="user-detail__meta">{p.email}</div>}
                    {p.paused && <div className="user-detail__meta">em modo pausa</div>}
                  </td>
                  <td data-label="Sumido há">{p.days} dias</td>
                  <td data-label="Último treino">{fmtDay(p.lastWorkout)}</td>
                  <td data-label="Último acesso">{p.lastSeen ? formatDate(p.lastSeen) : 'sem registro'}</td>
                  <td data-label="Canais">{[p.push && 'push', p.emailOk && 'e-mail'].filter(Boolean).join(' + ') || 'nenhum'}</td>
                  <td data-label="Último aviso">{formatDate(p.lastNotified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
