import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { goTo } from '../../lib/appNav';
import { timeAgo } from '../../lib/inbox';
import { trackEvent } from '../../lib/tracking';
import {
  RUN_SAVED_EVENT, fetchRunFeed, flushPendingRuns, toggleKudos, runTitle, paceSeconds, formatPace, formatClock, formatKm,
} from './runs';
import { SESSION_TITLE } from './program';
import RouteDrawing from './RouteDrawing';

import { t } from '../../lib/i18n';
const PAGE = 20;

function KudosButton({ run, onToggle }) {
  if (run.isMe) {
    return <span className="run-card__kudos run-card__kudos--mine">{t('👏 {v1}', { v1: run.kudos })}</span>;
  }
  return (
    <button
      type="button" aria-pressed={run.kudoed}
      className={`run-card__kudos${run.kudoed ? ' run-card__kudos--on' : ''}`}
      aria-label={run.kudoed ? t('Tirar aplauso') : t('Aplaudir a corrida de {v1}', { v1: run.name })}
      onClick={() => onToggle(run)}
    >👏 {run.kudos}</button>
  );
}

function RunCard({ run, onToggleKudos }) {
  const pace = paceSeconds(run.duration_s, run.distance_m);
  return (
    <li className="run-card">
      <div className="run-card__head">
        <span className="run-card__avatar" aria-hidden="true">{(run.isMe ? t('Você') : run.name || '?')[0].toUpperCase()}</span>
        <div className="run-card__who">
          <strong>{run.isMe ? t('Você') : run.name}</strong>
          <span>{timeAgo(run.started_at)}{run.kind && run.kind !== 'livre' ? ` · ${SESSION_TITLE[run.kind] || ''}` : ''}{run.visibility === 'privado' ? ` · ${t('🔒 só você')}` : ''}</span>
        </div>
      </div>
      <h3 className="run-card__title">{runTitle(run)}</h3>
      <div className="run-card__stats">
        <div><span>{t('Distância')}</span><strong>{t('{v1} km', { v1: formatKm(run.distance_m) })}</strong></div>
        <div><span>{t('Ritmo')}</span><strong>{formatPace(pace)}/km</strong></div>
        <div><span>{t('Tempo')}</span><strong>{formatClock(run.duration_s)}</strong></div>
      </div>
      <RouteDrawing route={run.route} width={320} height={170} />
      <div className="run-card__foot">
        <KudosButton run={run} onToggle={onToggleKudos} />
      </div>
    </li>
  );
}

// Aba Início do EAFIT Run: as suas corridas e as dos amigos, com aplausos.
export default function RunFeedPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      await flushPendingRuns(user.id);
      const list = await fetchRunFeed({ limit: PAGE });
      setFeed(list);
      setMore(list.length === PAGE);
      setError(false);
    } catch (err) {
      console.error('RunFeedPage:', err);
      setError(true);
    }
  }, [user]);

  useEffect(() => {
    load();
    window.addEventListener(RUN_SAVED_EVENT, load);
    return () => window.removeEventListener(RUN_SAVED_EVENT, load);
  }, [load]);

  async function loadMore() {
    if (!feed?.length) return;
    setLoadingMore(true);
    try {
      const next = await fetchRunFeed({ limit: PAGE, before: feed.at(-1).started_at });
      setFeed(list => [...list, ...next]);
      setMore(next.length === PAGE);
    } catch (err) {
      console.error('RunFeedPage more:', err);
      toast(t('⚠️ Não deu pra carregar mais corridas'));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleKudos(run) {
    // Mostra na hora; se falhar, volta como estava.
    const flip = r => (r.id === run.id ? { ...r, kudoed: !r.kudoed, kudos: r.kudos + (r.kudoed ? -1 : 1) } : r);
    setFeed(list => list.map(flip));
    try {
      const res = await toggleKudos(run.id);
      setFeed(list => list.map(r => (r.id === run.id ? { ...r, ...res } : r)));
      if (res.kudoed) trackEvent('run_kudos', 'dar');
    } catch (err) {
      console.error('toggleKudos:', err);
      setFeed(list => list.map(r => (r.id === run.id ? run : r)));
      toast(t('⚠️ Não deu pra aplaudir agora — tente de novo'));
    }
  }

  if (error && !feed) {
    return (
      <section id="page-inicio" className="page active">
        <div className="empty-state">
          <p>{t('⚠️ Não deu pra carregar as corridas.')}</p>
          <button type="button" className="btn btn--primary" onClick={load}>{t('Tentar de novo')}</button>
        </div>
      </section>
    );
  }
  if (!feed) {
    return (
      <section id="page-inicio" className="page active">
        <div className="skeleton" style={{ height: 260 }} />
        <div className="skeleton" style={{ height: 260, marginTop: 12 }} />
      </section>
    );
  }

  const hasFriendsRuns = feed.some(r => !r.isMe);
  return (
    <section id="page-inicio" className="page active">
      {!hasFriendsRuns && (
        <button type="button" className="dash-card run-plan-cta" onClick={() => goTo({ tab: 'desafios' })}>
          <strong>{t('👥 Corra com os amigos')}</strong>
          <span>{t('Adicione amigos em Desafios: as corridas deles aparecem aqui e vocês se aplaudem.')}</span>
        </button>
      )}
      {feed.length === 0 ? (
        <div className="empty-state">
          <p>{t('🏃 Nenhuma corrida ainda. Toque em Gravar e faça a primeira.')}</p>
          <button type="button" className="btn btn--primary" onClick={() => goTo({ tab: 'gravar' })}>{t('Gravar corrida')}</button>
        </div>
      ) : (
        <ul className="run-feed">
          {feed.map(r => <RunCard key={r.id} run={r} onToggleKudos={handleKudos} />)}
        </ul>
      )}
      {more && (
        <button type="button" className="btn btn--ghost btn--full" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? t('Carregando…') : t('Ver corridas mais antigas')}
        </button>
      )}
    </section>
  );
}
