import { useCallback, useEffect, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import {
  DURATION_OPTIONS, TITLE_MAX, normalizeCode, validateChallenge, challengeStatus, daysLeft, addDaysStr,
  friendlyChallengeError, inviteText, fetchMyChallenges, createChallenge, joinChallenge, leaveChallenge,
  fetchLeaderboard, fetchOfficialChallenges,
} from '../lib/challenges';
import Loading from './Loading';

import { t } from '../lib/i18n';
export function Leaderboard({ id }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let active = true;
    fetchLeaderboard(id)
      .then(r => { if (active) setRows(r); })
      .catch(err => { console.error('fetchLeaderboard:', err); if (active) setRows([]); });
    return () => { active = false; };
  }, [id]);

  if (!rows) return <Loading label={t('Carregando placar…')} />;
  return (
    <ol className="challenge__board">
      {rows.map((r, i) => (
        <li key={i} className={r.isMe ? 'challenge__row challenge__row--me' : 'challenge__row'}>
          <span>{r.rank}º {r.name}{r.isMe ? t('(você)') : ''}</span>
          <strong>{t('{n} dia(s)', { n: r.score })}</strong>
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
  const [official, setOfficial] = useState([]);
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
    // Complemento: sem os oficiais (offline, função ainda não publicada), a lista segue normal.
    try { setOfficial(await fetchOfficialChallenges()); } catch { setOfficial([]); }
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
    run(() => createChallenge(check.title, today, addDaysStr(today, days - 1)), t('🏁 Desafio criado! Compartilhe o código.'));
  }

  function handleJoin() {
    const c = normalizeCode(code);
    if (c.length < 4) { setError(t('Digite o código do convite.')); return; }
    run(() => joinChallenge(c), t('🎉 Você entrou no desafio!'));
  }

  async function handleShare(c) {
    const text = inviteText(c);
    try {
      if (navigator.share) await navigator.share({ title: c.title, text });
      else { await navigator.clipboard.writeText(text); toast(t('📋 Convite copiado')); }
    } catch (err) {
      if (err?.name !== 'AbortError') toast(t('Código: {invite_code}', { invite_code: c.invite_code }));
    }
  }

  async function handleLeave(c) {
    if (!window.confirm(t('Sair do desafio "{title}"?', { title: c.title }))) return;
    try { await leaveChallenge(c.id); toast(t('Você saiu do desafio')); setOpen(null); await reload(); }
    catch { toast(t('❌ Não foi possível sair')); }
  }

  if (!items) return null;

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('🏆 Desafios com amigos')}</div>

      {official.map(c => (
        <div className="challenge" key={c.id}>
          <div className="challenge__head" style={{ cursor: 'default' }}>
            <span className="challenge__title">⭐ {c.title}</span>
            <span className="challenge__meta">
              {t('Desafio oficial do EAFIT')}{' · '}
              {challengeStatus(c, today) === 'futuro' ? t('Ainda não começou') : t('{left} dia(s) restantes', { left: daysLeft(c, today) })}
              {' · '}{t('{n} pessoa(s)', { n: c.members })}
            </span>
          </div>
          <div className="challenge__actions">
            <button
              type="button" className="btn btn--primary btn--sm" disabled={busy}
              onClick={() => run(() => joinChallenge(c.invite_code), t('🎉 Você entrou no desafio!'))}
            >{t('Participar')}</button>
          </div>
        </div>
      ))}

      {items.length === 0 && official.length === 0 && mode === null && (
        <p className="dash-empty">{t('Crie um desafio e mande o código para os amigos: vence quem treinar mais dias no período.')}</p>
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
                {status === 'encerrado' ? t('Encerrado') : status === 'futuro' ? t('Ainda não começou') : left === 0 ? t('Último dia') : t('{left} dia(s) restantes', { left })}
                {' · '}{t('{n} pessoa(s)', { n: c.members })}{c.rank === null ? t('· você é o coach') : t('· você em {rank}º ({score})', { rank: c.rank, score: c.score })}
              </span>
            </button>
            {expanded && (
              <div className="challenge__body">
                <Leaderboard id={c.id} />
                <div className="challenge__actions">
                  {status !== 'encerrado' && (
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => handleShare(c)}>{t('📤 Convidar · {invite_code}', { invite_code: c.invite_code })}</button>
                  )}
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => handleLeave(c)}>{t('Sair')}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {mode === 'create' && (
        <div className="challenge__form">
          <input
            className="input input--sm" placeholder={t('Nome do desafio')} maxLength={TITLE_MAX}
            value={title} onChange={e => setTitle(e.target.value)} aria-label={t('Nome do desafio')}
          />
          <select className="input input--sm" value={days} onChange={e => setDays(Number(e.target.value))} aria-label={t('Duração')}>
            {DURATION_OPTIONS.map(d => <option key={d} value={d}>{t('{d} dias, começando hoje', { d })}</option>)}
          </select>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleCreate}>{busy ? t('Criando…') : t('Criar desafio')}</button>
        </div>
      )}
      {mode === 'join' && (
        <div className="challenge__form">
          <input
            className="input input--sm" placeholder={t('Código do convite')} maxLength={12} autoCapitalize="characters"
            value={code} onChange={e => setCode(e.target.value)} aria-label={t('Código do convite')}
          />
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleJoin}>{busy ? t('Entrando…') : t('Entrar')}</button>
        </div>
      )}
      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}

      <div className="challenge__actions">
        <button type="button" className="btn btn--outline btn--sm" onClick={() => { setMode(mode === 'create' ? null : 'create'); setError(''); }}>{t('+ Criar desafio')}</button>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => { setMode(mode === 'join' ? null : 'join'); setError(''); }}>{t('Entrar com código')}</button>
      </div>
    </div>
  );
}
