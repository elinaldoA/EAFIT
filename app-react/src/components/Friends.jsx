import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/useToast';
import { timeAgo } from '../lib/inbox';
import {
  REACTIONS, KIND_ICON, friendlyFriendError, normalizeFriendCode, friendInviteText, weeklyRanking,
  fetchMyFriendProfile, setShareActivity, requestFriend, respondFriend, removeFriendship,
  fetchMyFriends, fetchFeed, reactToEvent,
} from '../lib/friends';
import Loading from './Loading';

function FeedItem({ ev, onReact }) {
  return (
    <li className="feed__item">
      <span className="feed__icon" aria-hidden="true">{KIND_ICON[ev.kind]}</span>
      <div className="feed__main">
        <div className="feed__text">
          <strong>{ev.isMe ? 'Você' : ev.name}</strong> · {ev.title}
        </div>
        <div className="feed__meta">{ev.detail ? `${ev.detail} · ` : ''}{timeAgo(ev.at)}</div>
        <div className="feed__reactions">
          {REACTIONS.map(emoji => {
            const n = ev.counts[emoji] || 0;
            return (
              <button
                key={emoji} type="button" aria-pressed={ev.mine === emoji}
                aria-label={`Reagir com ${emoji}`}
                className={`feed__react${ev.mine === emoji ? ' feed__react--on' : ''}`}
                onClick={() => onReact(ev.id, emoji)}
              >{emoji}{n > 0 && <span>{n}</span>}</button>
            );
          })}
        </div>
      </div>
    </li>
  );
}

// Dashboard → Amigos: código pessoal, pedidos, ranking semanal e feed com reações.
export default function Friends({ myWeek }) {
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [friends, setFriends] = useState(null);
  const [feed, setFeed] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [p, f, e] = await Promise.all([fetchMyFriendProfile(), fetchMyFriends(), fetchFeed()]);
      setProfile(p); setFriends(f); setFeed(e);
    } catch (err) {
      console.error('Friends reload:', err);
      setFriends(f => f || []); setFeed(e => e || []);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const incoming = (friends || []).filter(f => f.status === 'incoming');
  const outgoing = (friends || []).filter(f => f.status === 'outgoing');
  const accepted = (friends || []).filter(f => f.status === 'friend');
  const ranking = useMemo(() => weeklyRanking(friends || [], myWeek), [friends, myWeek]);

  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); await reload(); }
    catch (err) { toast(`❌ ${friendlyFriendError(err)}`); }
  }

  async function handleAdd() {
    const c = normalizeFriendCode(code);
    if (c.length < 4) { setError('Digite o código do seu amigo.'); return; }
    setBusy(true); setError('');
    try {
      const res = await requestFriend(c);
      setCode('');
      toast(res === 'accepted' ? '🎉 Vocês agora são amigos!' : res === 'already' ? 'Pedido já enviado ou já são amigos' : '📨 Pedido enviado!');
      await reload();
    } catch (err) {
      setError(friendlyFriendError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleShareCode() {
    const text = friendInviteText(profile.code);
    try {
      if (navigator.share) await navigator.share({ title: 'EAFIT', text });
      else { await navigator.clipboard.writeText(text); toast('📋 Convite copiado'); }
    } catch (err) {
      if (err?.name !== 'AbortError') toast(`Código: ${profile.code}`);
    }
  }

  async function handleReact(id, emoji) {
    try { await reactToEvent(id, emoji); setFeed(await fetchFeed()); }
    catch (err) { toast(`❌ ${friendlyFriendError(err)}`); }
  }

  function handleToggleShare() {
    const next = !profile.share;
    act(() => setShareActivity(next), next ? '👀 Seus amigos voltam a ver sua atividade' : '🙈 Sua atividade ficou oculta');
  }

  if (!friends || !feed) return <div className="dash-card"><Loading label="Carregando amigos…" /></div>;

  return (<>
    <div className="dash-card">
      <div className="dash-card__title">👥 Amigos</div>
      {profile && (
        <div className="friends__me">
          <span>Seu código: <strong className="friends__code">{profile.code}</strong></span>
          <button type="button" className="btn btn--outline btn--sm" onClick={handleShareCode}>📤 Convidar</button>
        </div>
      )}
      <div className="challenge__form">
        <input
          className="input input--sm" placeholder="Código do seu amigo" maxLength={12} autoCapitalize="characters"
          value={code} onChange={e => setCode(e.target.value)} aria-label="Código do seu amigo"
        />
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleAdd}>
          {busy ? 'Enviando…' : 'Adicionar amigo'}
        </button>
      </div>
      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}

      {incoming.length > 0 && (
        <div className="friends__block">
          <div className="friends__label">Pedidos recebidos</div>
          {incoming.map(f => (
            <div className="friends__row" key={f.id}>
              <span>{f.name}</span>
              <span className="friends__actions">
                <button type="button" className="btn btn--primary btn--sm" onClick={() => act(() => respondFriend(f.id, true), '🎉 Amigo adicionado!')}>Aceitar</button>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => act(() => respondFriend(f.id, false))}>Recusar</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="friends__block">
          <div className="friends__label">Aguardando resposta</div>
          {outgoing.map(f => (
            <div className="friends__row" key={f.id}>
              <span>{f.name}</span>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => act(() => removeFriendship(f.id))}>Cancelar</button>
            </div>
          ))}
        </div>
      )}

      {accepted.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
        <p className="dash-empty">Passe seu código para um amigo (ou digite o dele) e acompanhem os treinos um do outro.</p>
      )}

      {accepted.length > 0 && (
        <div className="friends__block">
          <div className="friends__label">Ranking da semana (dias treinados em 7 dias)</div>
          <ol className="challenge__board">
            {ranking.map((r, i) => (
              <li key={i} className={r.isMe ? 'challenge__row challenge__row--me' : 'challenge__row'}>
                <span>{r.rank}º {r.name}</span><strong>{r.week} dia(s)</strong>
              </li>
            ))}
          </ol>
          <details className="friends__manage">
            <summary>Gerenciar amigos</summary>
            {accepted.map(f => (
              <div className="friends__row" key={f.id}>
                <span>{f.name}{f.week === null ? ' · atividade oculta' : ''}</span>
                <button
                  type="button" className="btn btn--outline btn--sm"
                  onClick={() => { if (window.confirm(`Remover ${f.name} dos amigos?`)) act(() => removeFriendship(f.id), 'Amigo removido'); }}
                >Remover</button>
              </div>
            ))}
          </details>
        </div>
      )}
    </div>

    <div className="dash-card">
      <div className="dash-card__title">📣 Atividade dos amigos</div>
      {feed.length === 0 ? (
        <p className="dash-empty">Quando você ou seus amigos concluírem treinos e baterem recordes, aparece aqui.</p>
      ) : (
        <ul className="feed">{feed.map(ev => <FeedItem key={ev.id} ev={ev} onReact={handleReact} />)}</ul>
      )}
      {profile && (
        <label className="friends__privacy">
          <input type="checkbox" checked={profile.share} onChange={handleToggleShare} />
          Compartilhar minha atividade com os amigos
        </label>
      )}
    </div>
  </>);
}
