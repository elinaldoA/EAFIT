import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { todayDate } from '../../data/treinoData';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { goTo } from '../../lib/appNav';
import { timeAgo } from '../../lib/inbox';
import { trackEvent } from '../../lib/tracking';
import {
  RUN_SAVED_EVENT, fetchRunFeed, flushPendingRuns, toggleKudos, runTitle, paceSeconds, formatPace, formatClock, formatKm,
  fetchRuns, mergeFeed,
} from './runs';
import { lastWeekSummary } from './challenges';
import RunComments from './RunComments';
import PushPrompt from '../../components/PushPrompt';
import { SESSION_TITLE, programFromMetadata, programToday, isRunSession, sessionTitle } from './program';
import RouteDrawing from './RouteDrawing';
import RunFlyby from './RunFlyby';
import { FeedPhotos } from './RunPhotos';
import { flybyCandidates } from './flybyMatch';
import { weatherText, weatherShort, startPosition } from './weather';
import { useStartWeather } from './useStartWeather';
import { renderRunCard, shareRunCard } from './runShareCard';
import StartCountdown from './StartCountdown';
import { startRun, setLiveRun, getLiveRun } from './liveRun';
import { geoSupported, useGeoTracker } from './useGeoTracker';
import { gpsStatusText } from './gpsStatus';
import { requestMotionPermission } from './cadence';
import { GPS_KEY, readPref } from './runPrefs';

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

// Resumo da semana passada no topo do Início (só com corrida na semana).
function WeekSummary({ runs }) {
  const s = lastWeekSummary(runs, todayDate());
  if (!s.runs) return null;
  return (
    <div className="dash-card run-summary">
      <span className="run-summary__label">{t('Sua semana passada')}</span>
      <strong>{t('{v1} km em {v2} corrida(s)', { v1: formatKm(s.meters, 1), v2: s.runs })}</strong>
      <span className="run-summary__meta">
        {formatClock(s.seconds)}
        {s.change !== null && (
          <span className={s.change >= 0 ? 'run-summary__up' : 'run-summary__down'}>
            {' · '}{s.change >= 0 ? t('▲ {v1}% sobre a semana anterior', { v1: s.change }) : t('▼ {v1}% sobre a semana anterior', { v1: -s.change })}
          </span>
        )}
      </span>
    </div>
  );
}

function RunCard({ run, feed, onToggleKudos }) {
  const toast = useToast();
  const [flybyOpen, setFlybyOpen] = useState(false);
  // Corridas do feed que aconteceram ao mesmo tempo que esta (com o tempo de cada ponto).
  const together = useMemo(() => flybyCandidates(run, feed), [run, feed]);
  const pace = paceSeconds(run.duration_s, run.distance_m);
  const [sharing, setSharing] = useState(false);
  // O cartão (com o clima) começa a ser desenhado no primeiro toque no botão:
  // quando o toque termina ele já está quase pronto (runShareCard.js).
  const prepared = useRef(null);
  const prepare = () => { if (!prepared.current) prepared.current = renderRunCard(run).catch(() => null); };
  async function handleShare() {
    prepare();
    setSharing(true);
    try {
      const result = await shareRunCard(run, prepared.current);
      if (result === 'downloaded') toast(t('🖼️ Imagem baixada'));
    } catch (err) {
      if (err?.name !== 'AbortError') toast(t('⚠️ Não foi possível gerar a imagem'));
    } finally {
      setSharing(false);
    }
  }
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(run.comments || 0);
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
      {run.weather && <p className="run-card__wx">{weatherText(run.weather)}</p>}
      {run.tags?.length > 0 && <p className="run-card__wx">{t('👥 Com {v1}', { v1: run.tags.join(', ') })}</p>}
      <div className="run-card__stats">
        <div><span>{t('Distância')}</span><strong>{t('{v1} km', { v1: formatKm(run.distance_m) })}</strong></div>
        <div><span>{t('Ritmo')}</span><strong>{formatPace(pace)}/km</strong></div>
        <div><span>{t('Tempo')}</span><strong>{formatClock(run.duration_s)}</strong></div>
      </div>
      <RouteDrawing route={run.route} width={320} height={170} />
      <FeedPhotos paths={run.photos} />
      <div className="run-card__foot">
        <KudosButton run={run} onToggle={onToggleKudos} />
        {together.length > 0 && (
          <button type="button" className="run-card__kudos" aria-label={t('Ver o flyby desta corrida')} onClick={() => setFlybyOpen(true)}>{t('🛰️ Flyby')}</button>
        )}
        <button
          type="button" className={`run-card__kudos run-card__comments${open ? ' run-card__kudos--on' : ''}`}
          aria-expanded={open} aria-label={t('Comentários ({v1})', { v1: count })} onClick={() => setOpen(o => !o)}
        >💬 {count}</button>
        {run.isMe && (
          <button
            type="button" className="run-card__kudos run-card__share" disabled={sharing}
            aria-label={t('Compartilhar a corrida')} onPointerDown={prepare} onFocus={prepare} onClick={handleShare}
          >{sharing ? t('Gerando imagem…') : t('📤 Compartilhar')}</button>
        )}
      </div>
      {open && <RunComments run={run} onCount={setCount} />}
      {flybyOpen && <RunFlyby run={run} candidates={together} onClose={() => setFlybyOpen(false)} />}
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
  const [mine, setMine] = useState([]);
  const [countdown, setCountdown] = useState(null); // { session } enquanto conta 3-2-1
  // O GPS já começa a procurar sinal durante a contagem 3-2-1 (a tela ao vivo assume em seguida).
  const gpsWanted = readPref(GPS_KEY) && geoSupported();
  const warm = useGeoTracker({ active: !!countdown && gpsWanted });
  // Clima no botão de começar: sem GPS aqui, usa o lugar onde a última corrida começou
  // (onde a pessoa costuma correr). Só a posição arredondada a 0,1° vai ao serviço de clima.
  const homePos = useMemo(() => {
    for (const r of mine) { const p = startPosition(r.route); if (p) return p; }
    return null;
  }, [mine]);
  const weather = useStartWeather(homePos);
  const feedRef = useRef(null);
  feedRef.current = feed;

  const load = useCallback(async () => {
    if (!user) return;
    try {
      await flushPendingRuns(user.id);
      fetchRuns(user.id).then(setMine).catch(() => {});
      const list = await fetchRunFeed({ limit: PAGE });
      setFeed(prev => mergeFeed(prev, list));
      // Já tinha aberto páginas mais antigas: o "ver mais" continua como estava.
      setMore(prev => (feedRef.current?.length > list.length ? prev : list.length === PAGE));
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

  // Treino do programa de hoje (se a pessoa tem programa e hoje é dia de correr).
  const program = programFromMetadata(user?.user_metadata);
  const where = program ? programToday(program, todayDate()) : null;
  const todaySession = where ? where.days[where.dayIndex] : null;
  const planned = todaySession && isRunSession(todaySession) ? { ...todaySession, week: where.week || null, dayIndex: where.dayIndex } : null;

  // Começar na hora, depois da contagem 3-2-1: o treino do programa de hoje, se houver,
  // senão corrida livre; o GPS vem do que a pessoa deixou na aba Gravar. Quem quer
  // escolher treino guiado ou GPS usa a aba Gravar.
  function quickStart(session) {
    if (getLiveRun()) return toast(t('Já existe uma corrida em andamento'));
    // iPhone: a permissão do acelerômetro (cadência) só pode ser pedida no toque.
    requestMotionPermission();
    setCountdown({ session });
  }
  function launch() {
    const { session } = countdown;
    setCountdown(null);
    if (getLiveRun()) return;
    setLiveRun(startRun({ gps: readPref(GPS_KEY) && geoSupported(), session }));
    trackEvent('run_start', session ? session.type : 'inicio');
  }

  const hasFriendsRuns = feed.some(r => !r.isMe);
  return (
    <section id="page-inicio" className="page active">
      {countdown && <StartCountdown onCancel={() => setCountdown(null)} onDone={launch} note={gpsWanted ? gpsStatusText(warm.status, warm.accuracy) : ''} />}
      {/* Atalho para começar: sem corridas o estado vazio abaixo já tem o botão de gravar. */}
      {feed.length > 0 && (
        <>
          <button type="button" className="btn btn--primary btn--full run-quick" onClick={() => quickStart(planned)}>
            {planned ? t('▶ Começar: {v1}', { v1: sessionTitle(planned) }) : t('▶ Começar corrida')}
            {weather && <span className="run-quick__wx">{weatherShort(weather)}</span>}
          </button>
          {planned && (
            <button type="button" className="btn btn--ghost btn--sm run-quick__free" onClick={() => quickStart(null)}>{t('Fazer corrida livre')}</button>
          )}
        </>
      )}
      <WeekSummary runs={mine} />
      {/* Quem já correu pode ligar os avisos de corrida: o convite só existia no resumo do treino de musculação. */}
      {feed.some(r => r.isMe) && <PushPrompt running />}
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
          {feed.map(r => <RunCard key={r.id} run={r} feed={feed} onToggleKudos={handleKudos} />)}
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
