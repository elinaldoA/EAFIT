import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../context/useAdminAuth';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import { setFeedBlock } from '../lib/community';
import {
  REASON_LABELS, STATUS_LABELS, blockUser, fetchModeration, ignoreReport, parseWords, removePost, reopenReport, saveWords,
} from '../lib/moderation';

const fmtDate = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function WordsCard({ saved, onSaved }) {
  const { adminUser } = useAdminAuth();
  const [text, setText] = useState(saved.join('\n'));
  const [msg, setMsg] = useState('');
  const next = parseWords(text);
  const dirty = next.join('|') !== saved.join('|');

  async function save() {
    setMsg('');
    try { await saveWords(next, adminUser?.id); setMsg('Salvo.'); onSaved(); } catch (err) { setMsg(`Erro: ${err.message}`); }
  }

  return (
    <div className="card">
      <h2 className="section-title">Palavras bloqueadas</h2>
      <label className="field">
        <span className="field__label">Uma por linha (ou separadas por vírgula)</span>
        <textarea className="input" rows={4} value={text} onChange={e => setText(e.target.value)} aria-label="Palavras bloqueadas" />
      </label>
      <div className="actions-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn--small btn--primary" disabled={!dirty} onClick={save}>Salvar</button>
        <span className="user-detail__meta">{next.length} palavra(s)</span>
        {msg && <span className={msg.startsWith('Erro') ? 'form-msg form-msg--error' : 'form-msg'}>{msg}</span>}
      </div>
      <p className="card-note">
        Publicações e apelidos dos últimos 30 dias que contêm uma dessas palavras aparecem em “Sinalizados”. Nada é
        escondido automaticamente — o admin decide.
      </p>
    </div>
  );
}

// Comunidade → Moderação.
export default function Moderation() {
  const [view, setView] = useState('aberta');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    fetchModeration(view === 'sinalizados' ? 'aberta' : view === 'resolvidas' ? '' : 'aberta')
      .then(d => { setData(d); setError(''); })
      .catch(err => setError(err.message));
  }, [view]);
  useEffect(() => { setData(null); load(); }, [load]);

  async function act(key, fn, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    try { await fn(); load(); } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  const reports = (data?.reports || []).filter(r => (view === 'resolvidas' ? r.status !== 'aberta' : r.status === 'aberta'));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Moderação</h1>
          <p className="page-subtitle">
            Denúncias feitas pelos amigos no feed do app (botão ⋯ na publicação) e publicações com palavras bloqueadas.
            Remover apaga a publicação; bloquear tira a pessoa do feed (ela continua usando o app).
          </p>
        </div>
      </div>

      <div className="seg" role="group" aria-label="Lista">
        {[['aberta', `Denúncias abertas${data ? ` (${(data.reports || []).filter(r => r.status === 'aberta').length})` : ''}`], ['sinalizados', `Sinalizados${data ? ` (${data.flags.length})` : ''}`], ['resolvidas', 'Resolvidas']].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={view === k} className={`seg__btn${view === k ? ' seg__btn--active' : ''}`} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>

      {error && <p className="form-msg form-msg--error">{error}</p>}
      {!data && !error && <Loading />}

      {data && view !== 'sinalizados' && (reports.length === 0 ? <EmptyState icon="🛡️" label={view === 'aberta' ? 'Nenhuma denúncia aberta.' : 'Nenhuma denúncia resolvida.'} /> : (
        <div className="table-wrap">
          <table className="resp-table">
            <thead><tr><th>Publicação</th><th>Quem publicou</th><th>Motivos</th><th>Denúncias</th><th>Quando</th><th /></tr></thead>
            <tbody>
              {reports.map(r => {
                const key = `${r.eventId}-${r.userId}`;
                return (
                  <tr key={key}>
                    <td data-label="Publicação">
                      {r.snapshot}
                      {!r.eventExists && <div className="user-detail__meta">já apagada</div>}
                      {r.notes.length > 0 && <div className="user-detail__meta">“{r.notes.join('” · “')}”</div>}
                    </td>
                    <td data-label="Quem publicou">
                      <Link to={`/users/${r.userId}`}>{r.userName}</Link>
                      {r.blocked && <div><span className="badge badge--danger">bloqueado no feed</span></div>}
                      {r.userReports > r.reports && <div className="user-detail__meta">{r.userReports} denúncia(s) contra a pessoa no total</div>}
                    </td>
                    <td data-label="Motivos">{r.reasons.map(x => REASON_LABELS[x] || x).join(', ')}</td>
                    <td data-label="Denúncias">{r.reports}</td>
                    <td data-label="Quando">{fmtDate(r.last)}</td>
                    <td data-label="">
                      {r.status === 'aberta' ? (
                        <div className="actions-row">
                          <button type="button" className="btn btn--danger btn--small" disabled={busy === key}
                            onClick={() => act(key, () => removePost(r), 'Apagar esta publicação do feed?')}>Remover publicação</button>
                          {!r.blocked && (
                            <button type="button" className="btn btn--ghost btn--small" disabled={busy === key}
                              onClick={() => act(key, () => blockUser(r), `Bloquear ${r.userName} no feed? As publicações deixam de aparecer para os amigos.`)}>Bloquear no feed</button>
                          )}
                          <button type="button" className="btn btn--ghost btn--small" disabled={busy === key} onClick={() => act(key, () => ignoreReport(r))}>Ignorar</button>
                        </div>
                      ) : (
                        <div className="actions-row">
                          <span className="user-detail__meta">{STATUS_LABELS[r.status]}</span>
                          <button type="button" className="btn btn--ghost btn--small" disabled={busy === key} onClick={() => act(key, () => reopenReport(r))}>Reabrir</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {data && view === 'sinalizados' && (
        <>
          {data.flags.length === 0 ? <EmptyState icon="✅" label={data.words.length ? 'Nada com palavras bloqueadas nos últimos 30 dias.' : 'Cadastre palavras bloqueadas abaixo.'} /> : (
            <div className="table-wrap">
              <table className="resp-table">
                <thead><tr><th>Quando</th><th>Quem</th><th>Publicação</th><th>Palavra</th><th /></tr></thead>
                <tbody>
                  {data.flags.map(f => (
                    <tr key={f.eventId}>
                      <td data-label="Quando">{fmtDate(f.at)}</td>
                      <td data-label="Quem"><Link to={`/users/${f.userId}`}>{f.name || 'sem apelido'}</Link></td>
                      <td data-label="Publicação">{f.text}</td>
                      <td data-label="Palavra"><span className="badge badge--warning">{f.word}</span></td>
                      <td data-label="">
                        <div className="actions-row">
                          <button type="button" className="btn btn--danger btn--small" disabled={busy === `f${f.eventId}`}
                            onClick={() => act(`f${f.eventId}`, () => removePost({ eventId: f.eventId, userId: f.userId, eventExists: true }), 'Apagar esta publicação do feed?')}>Remover</button>
                          {!f.blocked && (
                            <button type="button" className="btn btn--ghost btn--small" disabled={busy === `f${f.eventId}`}
                              onClick={() => act(`f${f.eventId}`, () => setFeedBlock(f.userId, true), 'Bloquear esta pessoa no feed?')}>Bloquear no feed</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <WordsCard key={data.words.join('|')} saved={data.words} onSaved={load} />
        </>
      )}
    </div>
  );
}
