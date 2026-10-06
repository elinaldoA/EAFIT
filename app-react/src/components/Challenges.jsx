import { useCallback, useEffect, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import {
  DURATION_OPTIONS, TITLE_MAX, normalizeCode, validateChallenge, challengeStatus, daysLeft, addDaysStr,
  friendlyChallengeError, inviteText, fetchMyChallenges, createChallenge, joinChallenge, leaveChallenge,
  fetchLeaderboard,
} from '../lib/challenges';

function Leaderboard({ id }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let active = true;
    fetchLeaderboard(id)
      .then(r => { if (active) setRows(r); })
      .catch(err => { console.error('fetchLeaderboard:', err); if (active) setRows([]); });
    return () => { active = false; };
  }, [id]);

  if (!rows) return <p className="dash-empty">Carregando placar…</p>;
  return (
    <ol className="challenge__board">
      {rows.map((r, i) => (
        <li key={i} className={r.isMe ? 'challenge__row challenge__row--me' : 'challenge__row'}>
          <span>{r.rank}º {r.name}{r.isMe ? ' (você)' : ''}</span>
          <strong>{r.score} dia(s)</strong>
        </li>
      ))}
    </ol>
  );
}

// Desafios com amigos (Dashboard → Treinos): cria ou entra por código; o placar
// é de dias treinados no período.
export default function Challenges() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [mode, setMode] = useState(null); // 'create' | 'join' | null
  const [title, setTitle] = useState('');
  const [days, setDays] = useState(7);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayDate();

  const reload = useCallback(async () => {
    try { setItems(await fetchMyChallenges()); } catch (err) { console.error('fetchMyChallenges:', err); setItems([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function run(fn, okMsg) {
    setBusy(true); setError('');
    try {
      await fn();
      setMode(null); setTitle(''); setCode('');
      toast(okMsg);
      await reload();
    } catch (err) {
      setError(friendlyChallengeError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleCreate() {
    const check = validateChallenge(title, days);
    if (!check.ok) { setError(check.error); return; }
    run(() => createChallenge(check.title, today, addDaysStr(today, days - 1)), '🏁 Desafio criado! Compartilhe o código.');
  }

  function handleJoin() {
    const c = normalizeCode(code);
    if (c.length < 4) { setError('Digite o código do convite.'); return; }
    run(() => joinChallenge(c), '🎉 Você entrou no desafio!');
  }

  async function handleShare(c) {
    const text = inviteText(c);
    try {
      if (navigator.share) await navigator.share({ title: c.title, text });
      else { await navigator.clipboard.writeText(text); toast('📋 Convite copiado'); }
    } catch (err) {
      if (err?.name !== 'AbortError') toast(`Código: ${c.invite_code}`);
    }
  }

  async function handleLeave(c) {
    if (!window.confirm(`Sair do desafio "${c.title}"?`)) return;
    try { await leaveChallenge(c.id); toast('Você saiu do desafio'); setOpen(null); await reload(); }
    catch { toast('❌ Não foi possível sair'); }
  }

  if (!items) return null;

  return (
    <div className="dash-card">
      <div className="dash-card__title">🏆 Desafios com amigos</div>

      {items.length === 0 && mode === null && (
        <p className="dash-empty">Crie um desafio e mande o código para os amigos: vence quem treinar mais dias no período.</p>
      )}

      {items.map(c => {
        const status = challengeStatus(c, today);
        const left = daysLeft(c, today);
        const expanded = open === c.id;
        return (
          <div className="challenge" key={c.id}>
            <button type="button" className="challenge__head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.id)}>
              <span className="challenge__title">{c.title}</span>
              <span className="challenge__meta">
                {status === 'encerrado' ? 'Encerrado' : status === 'futuro' ? 'Ainda não começou' : left === 0 ? 'Último dia' : `${left} dia(s) restantes`}
                {' · '}{c.members} pessoa(s) · você em {c.rank}º ({c.score})
              </span>
            </button>
            {expanded && (
              <div className="challenge__body">
                <Leaderboard id={c.id} />
                <div className="challenge__actions">
                  {status !== 'encerrado' && (
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => handleShare(c)}>📤 Convidar · {c.invite_code}</button>
                  )}
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => handleLeave(c)}>Sair</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {mode === 'create' && (
        <div className="challenge__form">
          <input
            className="input input--sm" placeholder="Nome do desafio" maxLength={TITLE_MAX}
            value={title} onChange={e => setTitle(e.target.value)} aria-label="Nome do desafio"
          />
          <select className="input input--sm" value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Duração">
            {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d} dias, começando hoje</option>)}
          </select>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleCreate}>{busy ? 'Criando…' : 'Criar desafio'}</button>
        </div>
      )}
      {mode === 'join' && (
        <div className="challenge__form">
          <input
            className="input input--sm" placeholder="Código do convite" maxLength={12} autoCapitalize="characters"
            value={code} onChange={e => setCode(e.target.value)} aria-label="Código do convite"
          />
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleJoin}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </div>
      )}
      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}

      <div className="challenge__actions">
        <button type="button" className="btn btn--outline btn--sm" onClick={() => { setMode(mode === 'create' ? null : 'create'); setError(''); }}>+ Criar desafio</button>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => { setMode(mode === 'join' ? null : 'join'); setError(''); }}>Entrar com código</button>
      </div>
    </div>
  );
}
