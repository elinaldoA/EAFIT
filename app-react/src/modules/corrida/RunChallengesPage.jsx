import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { todayDate } from '../../data/treinoData';
import {
  friendlyFriendError, normalizeFriendCode, shareFriendCode, fetchMyFriendProfile, setShareActivity,
  requestFriend, respondFriend, removeFriendship, fetchMyFriends,
} from '../../lib/friends';
import { RUN_SAVED_EVENT, fetchRuns, fetchFriendsWeek, formatKm, decimal } from './runs';
import RunClubs from './Clubs';
import { monthlyChallenges, challengeProgress, monthMedals } from './challenges';

import { t, locale } from '../../lib/i18n';
const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

function MonthChallenges({ runs, today }) {
  const list = monthlyChallenges(runs, today);
  const month = new Date(`${today}T12:00:00`).toLocaleDateString(locale, { month: 'long' });
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Desafios de {v1}', { v1: month })}</div>
      <ul className="run-challenges">
        {list.map(c => (
          <li key={c.kind} className={`run-challenge${c.done ? ' run-challenge--done' : ''}`}>
            <span className="run-challenge__icon" aria-hidden="true">{c.done ? '🏅' : c.icon}</span>
            <div className="run-challenge__main">
              <strong>{c.done ? t('Todos os níveis completos!') : c.title}</strong>
              <div className="run-live__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(challengeProgress(c) * 100)} aria-label={c.title}>
                <span style={{ width: `${Math.round(challengeProgress(c) * 100)}%` }} />
              </div>
              <span className="run-challenge__meta">
                {c.kind === 'km' || c.kind === 'long'
                  ? t('{v1} de {v2} km', { v1: formatKm(c.value * 1000, 1), v2: decimal(c.goal) })
                  : t('{v1} de {v2}', { v1: c.value, v2: c.goal })}
                {' · '}{t('nível {v1} de {v2}', { v1: Math.min(c.tierDone + 1, c.tiers), v2: c.tiers })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Medalhas dos níveis de desafio batidos, agrupadas por mês.
function Medals({ runs, today }) {
  const medals = monthMedals(runs, today);
  if (!medals.length) return null;
  const months = [...new Set(medals.map(m => m.month))];
  const label = month => {
    const text = new Date(`${month}-15T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Suas medalhas ({v1})', { v1: medals.length })}</div>
      <div className="dash-card run-medals">
        {months.map(month => (
          <div key={month} className="run-medals__month">
            <span className="run-medals__label">{label(month)}</span>
            <ul className="run-medals__list">
              {medals.filter(m => m.month === month).map(m => (
                <li key={`${m.kind}-${m.goal}`} className="run-medal" title={m.title}>
                  <span className="run-medal__icon" aria-hidden="true">🏅</span>
                  <span>{m.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekRanking({ rows }) {
  if (!rows || rows.length < 2) return null;
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Km da semana entre amigos')}</div>
      <ol className="challenge__board run-ranking">
        {rows.map((r, i) => (
          <li key={i} className={r.isMe ? 'challenge__row challenge__row--me' : 'challenge__row'}>
            <span>{MEDAL[r.rank] || `${r.rank}º`} {r.isMe ? t('Você') : r.name}</span>
            <strong>{t('{v1} km', { v1: formatKm(r.meters, 1) })}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Amigos do EAFIT Run: são os mesmos amigos da conta (lib/friends.js).
function RunFriends({ onChange }) {
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [friends, setFriends] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([fetchMyFriendProfile(), fetchMyFriends()]);
      setProfile(p); setFriends(f);
    } catch (err) {
      console.error('RunFriends:', err);
      setFriends(f => f || []);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); await reload(); onChange?.(); }
    catch (err) { toast(`❌ ${friendlyFriendError(err)}`); }
  }

  async function handleAdd() {
    const c = normalizeFriendCode(code);
    if (c.length < 4) { setError(t('Digite o código do seu amigo.')); return; }
    setBusy(true); setError('');
    try {
      const res = await requestFriend(c);
      setCode('');
      toast(res === 'accepted' ? t('🎉 Vocês agora são amigos!') : res === 'already' ? t('Pedido já enviado ou já são amigos') : t('📨 Pedido enviado!'));
      await reload();
      onChange?.();
    } catch (err) {
      setError(friendlyFriendError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleShareCode() {
    const result = await shareFriendCode(profile.code);
    if (result === 'copied') toast(t('📋 Convite copiado'));
    else if (result === 'failed') toast(t('Código: {code}', { code: profile.code }));
  }

  if (!friends) return null;
  const incoming = friends.filter(f => f.status === 'incoming');
  const outgoing = friends.filter(f => f.status === 'outgoing');
  const accepted = friends.filter(f => f.status === 'friend');

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('👥 Amigos')}</div>
      {profile && (
        <div className="friends__me">
          <span>{t('Seu código:')} <strong className="friends__code">{profile.code}</strong></span>
          <button type="button" className="btn btn--outline btn--sm" onClick={handleShareCode}>{t('📤 Convidar')}</button>
        </div>
      )}
      <div className="challenge__form">
        <input
          className="input input--sm" placeholder={t('Código do seu amigo')} maxLength={12} autoCapitalize="characters"
          value={code} onChange={e => setCode(e.target.value)} aria-label={t('Código do seu amigo')}
        />
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleAdd}>
          {busy ? t('Enviando…') : t('Adicionar amigo')}
        </button>
      </div>
      {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}

      {incoming.length > 0 && (
        <div className="friends__block">
          <div className="friends__label">{t('Pedidos recebidos')}</div>
          {incoming.map(f => (
            <div className="friends__row" key={f.id}>
              <span>{f.name}</span>
              <span className="friends__actions">
                <button type="button" className="btn btn--primary btn--sm" onClick={() => act(() => respondFriend(f.id, true), t('🎉 Amigo adicionado!'))}>{t('Aceitar')}</button>
                <button type="button" className="btn btn--outline btn--sm" onClick={() => act(() => respondFriend(f.id, false))}>{t('Recusar')}</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="friends__block">
          <div className="friends__label">{t('Aguardando resposta')}</div>
          {outgoing.map(f => (
            <div className="friends__row" key={f.id}>
              <span>{f.name}</span>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => act(() => removeFriendship(f.id))}>{t('Cancelar')}</button>
            </div>
          ))}
        </div>
      )}
      {accepted.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
        <p className="dash-empty">{t('Passe seu código para quem corre com você (ou digite o dele): vocês veem as corridas um do outro e disputam os km da semana.')}</p>
      )}
      {accepted.length > 0 && (
        <details className="friends__manage">
          <summary>{t('Gerenciar amigos ({v1})', { v1: accepted.length })}</summary>
          {accepted.map(f => (
            <div className="friends__row" key={f.id}>
              <span>{f.name}{f.week === null ? t('· atividade oculta') : ''}</span>
              <button
                type="button" className="btn btn--outline btn--sm"
                onClick={() => { if (window.confirm(t('Remover {name} dos amigos?', { name: f.name }))) act(() => removeFriendship(f.id), t('Amigo removido')); }}
              >{t('Remover')}</button>
            </div>
          ))}
        </details>
      )}
      {profile && (
        <label className="friends__privacy">
          <input type="checkbox" checked={profile.share} onChange={() => act(() => setShareActivity(!profile.share), profile.share ? t('🙈 Sua atividade ficou oculta') : t('👀 Seus amigos voltam a ver sua atividade'))} />
          {t('Compartilhar minhas corridas com os amigos')}
        </label>
      )}
    </div>
  );
}

// Aba Desafios do EAFIT Run: desafios do mês, km da semana entre amigos e amigos.
export default function RunChallengesPage() {
  const { user } = useAuth();
  const today = todayDate();
  const [runs, setRuns] = useState([]);
  const [ranking, setRanking] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [r, w] = await Promise.allSettled([fetchRuns(user.id), fetchFriendsWeek()]);
    if (r.status === 'fulfilled') setRuns(r.value); else console.error('RunChallenges runs:', r.reason);
    if (w.status === 'fulfilled') setRanking(w.value); else console.error('RunChallenges week:', w.reason);
  }, [user]);

  useEffect(() => {
    load();
    window.addEventListener(RUN_SAVED_EVENT, load);
    return () => window.removeEventListener(RUN_SAVED_EVENT, load);
  }, [load]);

  return (
    <section id="page-desafios" className="page active">
      <MonthChallenges runs={runs} today={today} />
      <Medals runs={runs} today={today} />
      <WeekRanking rows={ranking} />
      <RunClubs />
      <RunFriends onChange={load} />
    </section>
  );
}
