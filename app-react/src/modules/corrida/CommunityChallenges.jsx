import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../context/useToast';
import { todayDate } from '../../data/treinoData';
import { RUN_SAVED_EVENT } from './runs';
import {
  fetchCommunityChallenges, joinCommunityChallenge, leaveCommunityChallenge, fetchCommunityRanking,
  communityStatus, communityDone, communityProgress, communityDaysLeft, communityGoalText,
  formatCommunityAmount, communityError,
} from './runsCommunity';
import { t, locale } from '../../lib/i18n';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
const day = d => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

function Ranking({ challenge }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCommunityRanking(challenge.id)
      .then(r => { if (alive) setRows(r); })
      .catch(err => { console.error('CommunityRanking:', err); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [challenge.id, challenge.value]);

  if (failed) return <p className="dash-empty">{t('Não deu para carregar o ranking agora.')}</p>;
  if (!rows) return <p className="dash-empty">{t('Carregando…')}</p>;
  return (
    <ol className="challenge__board run-ranking">
      {rows.map((r, i) => (
        <li key={i} className={r.isMe ? 'challenge__row challenge__row--me' : 'challenge__row'}>
          <span>{MEDAL[r.rank] && r.value > 0 ? MEDAL[r.rank] : `${r.rank}º`} {r.isMe ? t('Você') : r.name}</span>
          <strong>{formatCommunityAmount(challenge.metric, r.value)}</strong>
        </li>
      ))}
    </ol>
  );
}

function CommunityCard({ c, today, busy, onJoin, onLeave }) {
  const [showRanking, setShowRanking] = useState(false);
  const status = communityStatus(c, today);
  const done = communityDone(c);
  const pct = Math.round(communityProgress(c) * 100);
  const left = communityDaysLeft(c, today);

  return (
    <li className={`run-challenge run-community${done ? ' run-challenge--done' : ''}`}>
      <span className="run-challenge__icon" aria-hidden="true">{done ? '🏅' : '🏆'}</span>
      <div className="run-challenge__main">
        <strong>{c.title}</strong>
        {c.description && <p className="run-community__desc">{c.description}</p>}
        <span className="run-challenge__meta">
          {communityGoalText(c)} · {day(c.start)} – {day(c.end)}
        </span>
        <span className="run-community__people">
          {t('{v1} participantes', { v1: c.members })}
          {status === 'upcoming' && ` · ${t('começa em {v1}', { v1: day(c.start) })}`}
          {status === 'running' && ` · ${left === 1 ? t('último dia') : t('faltam {v1} dias', { v1: left })}`}
          {status === 'ended' && ` · ${t('encerrado')}`}
        </span>

        {!c.joined && status !== 'ended' && (
          <>
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => onJoin(c)}>
              {busy ? t('Entrando…') : t('Participar do desafio')}
            </button>
            <span className="profile-field__hint">{t('Seu nome e o seu total aparecem no ranking. Contam todas as suas corridas do período, inclusive as de esteira e as privadas (ninguém vê a corrida, só o total).')}</span>
          </>
        )}

        {c.joined && (
          <>
            <div className="run-live__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={c.title}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="run-challenge__meta">
              {t('{v1} de {v2}', { v1: formatCommunityAmount(c.metric, c.value), v2: formatCommunityAmount(c.metric, c.goal) })}
              {c.value > 0 && c.rank ? ` · ${t('{v1}º lugar', { v1: c.rank })}` : ''}
            </span>
            {done && <span className="run-community__done">{t('🏅 Desafio concluído!')}</span>}
            <div className="run-community__actions">
              <button type="button" className="btn btn--outline btn--sm" aria-expanded={showRanking} onClick={() => setShowRanking(s => !s)}>
                {showRanking ? t('Esconder ranking') : t('Ver ranking')}
              </button>
              {status !== 'ended' && (
                <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => onLeave(c)}>{t('Sair')}</button>
              )}
            </div>
            {showRanking && <Ranking challenge={c} />}
          </>
        )}
      </div>
    </li>
  );
}

// Desafios criados pelo EAFIT (admin): o topo da aba Desafios. Sem desafio
// aberto — ou sem a tabela no banco —, a seção nem aparece.
export default function CommunityChallenges() {
  const toast = useToast();
  const today = todayDate();
  const [list, setList] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setList(await fetchCommunityChallenges());
    } catch (err) {
      console.error('CommunityChallenges:', err);
      setList(l => l || []);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(RUN_SAVED_EVENT, load);
    return () => window.removeEventListener(RUN_SAVED_EVENT, load);
  }, [load]);

  async function act(c, fn, okMsg) {
    setBusyId(c.id);
    try { await fn(c.id); toast(okMsg); await load(); }
    catch (err) { toast(communityError(err)); }
    finally { setBusyId(null); }
  }

  // Quem não entrou e o desafio já acabou não precisa ver.
  const shown = (list || []).filter(c => c.joined || communityStatus(c, today) !== 'ended');
  if (!shown.length) return null;

  return (
    <div className="section-group">
      <div className="section-group__label">{t('🏆 Desafios da comunidade')}</div>
      <ul className="run-challenges">
        {shown.map(c => (
          <CommunityCard
            key={c.id} c={c} today={today} busy={busyId === c.id}
            onJoin={x => act(x, joinCommunityChallenge, t('🎉 Você entrou no desafio!'))}
            onLeave={x => act(x, leaveCommunityChallenge, t('Você saiu do desafio'))}
          />
        ))}
      </ul>
    </div>
  );
}
