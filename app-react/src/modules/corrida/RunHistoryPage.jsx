import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { todayDate } from '../../data/treinoData';
import { fmtDate } from '../../lib/utils';
import {
  RUN_SAVED_EVENT, runTitle, fetchRuns, flushPendingRuns, deleteRun, computeRunStats, paceSeconds, formatPace, formatClock, formatKm, EFFORT_KM,
  fetchShoes, cachedShoes,
} from './runs';
import SplitBars from './SplitBars';
import { downloadGpx } from './gpx';
import { downloadTcx } from './tcx';
import RunShoes from './Shoes';
import { SESSION_TITLE } from './program';
import RouteDrawing from './RouteDrawing';
import PrivacyZones from './PrivacyZones';
import { renderRunCard, shareRunCard, renderRunSummaryCard, shareRunSummary } from './runShareCard';
import RunPhotoShare from './RunPhotoShare';
import { monthSummary } from './runSummary';
import { useDeferredRemoval } from '../../lib/useDeferredRemoval';
import { PERIODS, kindsIn, filterRuns, readFilters, writeFilters } from './runFilter';
import EditRunForm from './EditRunForm';
import RunInsights from './RunInsights';
import IntervalResults from './IntervalResults';
import { weatherText, weatherShort } from './weather';
import { hrText } from './heartRate';
import { gradeAdjustedPace } from './elevation';
import HrZones from './HrZones';
import { ghostFrom, bestOnSameRoute } from './ghost';
import { startRun, setLiveRun, getLiveRun } from './liveRun';
import { geoSupported } from './useGeoTracker';
import { requestMotionPermission } from './cadence';
import { GPS_KEY, readPref } from './runPrefs';
import { trackEvent } from '../../lib/tracking';

import { t } from '../../lib/i18n';
const EFFORT_LABEL = { 1: t('1 km'), 5: t('5 km'), 10: t('10 km'), 21: t('21 km') };

const gap = run => gradeAdjustedPace(run.splits, run.km_elev);

function RunItem({ run, runs, shoe, onDelete }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const { user } = useAuth();
  // O card é desenhado ao abrir a corrida: no toque em Compartilhar ele já
  // está pronto e o share nativo não perde o gesto (lib/shareCard.js).
  const prepared = useRef(null);
  useEffect(() => {
    if (open && !prepared.current) prepared.current = renderRunCard(run).catch(() => null);
  }, [open, run]);

  async function handleShare() {
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
  const pace = paceSeconds(run.duration_s, run.distance_m);
  // A melhor corrida da mesma rota (só calculada com a corrida aberta).
  const best = useMemo(() => (open && !run.pending ? bestOnSameRoute(runs, run) : run), [open, runs, run]);

  // Começa uma corrida nova contra `target` (o fantasma), pelo mesmo caminho da aba Gravar.
  function runAgainst(target) {
    if (getLiveRun()) return toast(t('Já existe uma corrida em andamento'));
    const ghost = ghostFrom(target);
    if (!ghost) return;
    requestMotionPermission();
    setLiveRun(startRun({ gps: geoSupported() && (!!run.gps || readPref(GPS_KEY)), ghost }));
    trackEvent('run_start', 'fantasma');
  }
  const canRepeat = !run.pending && !!ghostFrom(run);
  return (
    <li className={`run-item${open ? ' run-item--open' : ''}`}>
      <button type="button" className="run-item__head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="run-item__date">{fmtDate(run.run_date)}</span>
        <span className="run-item__main">
          <strong>{runTitle(run)}{run.visibility === 'privado' ? ' 🔒' : ''}</strong>
          <span>{t('{v1} km', { v1: formatKm(run.distance_m) })}</span>
          <span>{formatClock(run.duration_s)} · {formatPace(pace)}/km</span>
          {run.weather && weatherShort(run.weather) && <span className="run-item__wx">{weatherShort(run.weather)}</span>}
        </span>
        <span className="run-item__kind">{SESSION_TITLE[run.kind] || SESSION_TITLE.livre}{run.pending ? ' · 📶' : ''}</span>
      </button>
      {open && editing && (
        <div className="run-item__body">
          <EditRunForm userId={user.id} run={run} onClose={() => setEditing(false)} />
        </div>
      )}
      {open && !editing && (
        <div className="run-item__body">
          <RouteDrawing route={run.route} splits={run.splits} detail width={320} height={190} />
          {(run.elev_gain_m != null || run.cadence || shoe) && (
            <div className="run-live__extra run-item__extra">
              {run.elev_gain_m != null && <span>{t('↗ {v1} m de subida', { v1: run.elev_gain_m })}</span>}
              {run.cadence && <span>{t('👣 {v1} passos/min', { v1: run.cadence })}</span>}
              {shoe && <span>👟 {shoe.name}</span>}
            </div>
          )}
          {gap(run) && (
            <p className="run-item__weather">
              {t('⛰ Ritmo ajustado pela inclinação: {v1}/km (real {v2}/km)', { v1: formatPace(gap(run).adjusted), v2: formatPace(gap(run).actual) })}
            </p>
          )}
          {run.hr && <p className="run-item__weather">{hrText(run.hr)}</p>}
          {run.hr?.z && <HrZones zones={run.hr.z} />}
          {run.weather && <p className="run-item__weather">{weatherText(run.weather)}</p>}
          {run.splits.length > 0 ? <SplitBars splits={run.splits} elev={run.km_elev} />
            : <p className="profile-field__hint">{t('Sem tempo por km (distância digitada).')}</p>}
          {run.intervals?.length > 0 && (
            <>
              <strong>{t('Seus tiros')}</strong>
              <IntervalResults reps={run.intervals} />
            </>
          )}
          {run.effort && <p>{t('Esforço: {v1}/10', { v1: run.effort })}</p>}
          {run.notes && <p className="run-item__notes">{run.notes}</p>}
          {run.pending && <p className="profile-field__hint">{t('Ainda no aparelho: sobe quando houver internet.')}</p>}
          {run.route.length > 0 && (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadGpx(run)}>{t('📤 Exportar GPX')}</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadTcx(run)}>{t('📤 Exportar TCX (Garmin, Strava)')}</button>
            </>
          )}
          {canRepeat && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => runAgainst(run)}>
              {t('🏁 Correr de novo contra esta ({v1})', { v1: formatClock(run.duration_s) })}
            </button>
          )}
          {canRepeat && best.client_id !== run.client_id && (
            <button type="button" className="btn btn--outline btn--sm" onClick={() => runAgainst(best)}>
              {t('👑 Correr contra a minha melhor nessa rota ({v1}, {v2})', { v1: formatClock(best.duration_s), v2: fmtDate(best.run_date) })}
            </button>
          )}
          <button type="button" className="btn btn--primary btn--sm" disabled={sharing} onClick={handleShare}>
            {sharing ? t('Gerando imagem…') : t('📤 Compartilhar nos stories')}
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setPhotoOpen(true)}>
            {t('📸 Compartilhar com foto')}
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(true)}>{t('✏️ Editar corrida')}</button>
          <button
            type="button" className="btn btn--ghost btn--sm"
            onClick={() => onDelete(run)}
          >{t('Apagar corrida')}</button>
        </div>
      )}
      {photoOpen && <RunPhotoShare run={run} onClose={() => setPhotoOpen(false)} />}
    </li>
  );
}

// Aba Você do EAFIT Run: km da semana, do mês e do ano, totais, recordes, km
// por semana e a lista das suas corridas (inclusive as que ainda estão no aparelho).
// Cartão do mês para os stories. A imagem começa a ser desenhada no primeiro toque.
function SummaryShare({ runs, today }) {
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const prepared = useRef(null);
  const prepare = () => { if (!prepared.current) prepared.current = renderRunSummaryCard(runs, today).catch(() => null); };
  async function handle() {
    prepare();
    setSharing(true);
    try {
      const result = await shareRunSummary(runs, today, prepared.current);
      if (result === 'downloaded') toast(t('🖼️ Imagem baixada'));
    } catch (err) {
      if (err?.name !== 'AbortError') toast(t('⚠️ Não foi possível gerar a imagem'));
    } finally {
      setSharing(false);
    }
  }
  return (
    <button type="button" className="btn btn--outline btn--sm run-periods__share" disabled={sharing} onPointerDown={prepare} onFocus={prepare} onClick={handle}>
      {sharing ? t('Gerando imagem…') : t('📤 Compartilhar meu mês')}
    </button>
  );
}

export default function RunHistoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [allRuns, setRuns] = useState(null);
  // Apagar some da tela na hora e só vai ao servidor em 6 s: dá para desfazer (lib/useDeferredRemoval.js).
  const removal = useDeferredRemoval();
  const runs = useMemo(() => (allRuns ? allRuns.filter(r => !removal.hidden.has(r.client_id)) : allRuns), [allRuns, removal.hidden]);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState(readFilters);
  const { period, kind } = filters;
  const setPeriod = p => { const next = { ...filters, period: p }; setFilters(next); writeFilters(next); };
  const setKind = k => { const next = { ...filters, kind: k }; setFilters(next); writeFilters(next); };
  const [shoes, setShoes] = useState(() => (user ? cachedShoes(user.id) : []));
  const loadShoes = useCallback(async () => {
    if (user) setShoes(await fetchShoes(user.id));
  }, [user]);
  useEffect(() => { loadShoes(); }, [loadShoes]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      await flushPendingRuns(user.id);
      setRuns(await fetchRuns(user.id));
      setError(false);
    } catch (err) {
      console.error('RunHistoryPage:', err);
      setError(true);
    }
  }, [user]);

  useEffect(() => {
    load();
    window.addEventListener(RUN_SAVED_EVENT, load);
    return () => window.removeEventListener(RUN_SAVED_EVENT, load);
  }, [load]);

  function handleDelete(run) {
    removal.schedule(run.client_id, async () => {
      try {
        await deleteRun(user.id, run);
        setRuns(list => list.filter(r => r.client_id !== run.client_id));
      } catch (err) {
        console.error('deleteRun:', err);
        toast(t('⚠️ Não foi possível apagar — tente novamente'));
      }
    });
    toast(t('Corrida apagada'), 6000, { action: { label: t('Desfazer'), onClick: () => removal.undo(run.client_id) } });
  }

  if (error && !runs) {
    return (
      <section id="page-voce" className="page active">
        <div className="empty-state">
          <p>{t('⚠️ Não deu pra carregar suas corridas.')}</p>
          <button type="button" className="btn btn--primary" onClick={load}>{t('Tentar de novo')}</button>
        </div>
      </section>
    );
  }
  if (!runs) {
    return (
      <section id="page-voce" className="page active">
        <div className="skeleton" style={{ height: 130 }} />
        <div className="skeleton" style={{ height: 200, marginTop: 12 }} />
      </section>
    );
  }
  if (!runs.length) {
    return (
      <section id="page-voce" className="page active">
        <div className="empty-state">
          <p>{t('🏃 Nenhuma corrida ainda. Comece pela aba Gravar: cada corrida aparece aqui com tempo, ritmo e recordes.')}</p>
        </div>
      </section>
    );
  }

  const today = todayDate();
  const stats = computeRunStats(runs, today);
  const sumSince = from => runs.filter(r => r.run_date >= from && r.run_date <= today).reduce((s, r) => s + r.distance_m, 0);
  const periods = [
    [t('Semana'), sumSince(stats.weeks.at(-1).start)],
    [t('Mês'), sumSince(`${today.slice(0, 7)}-01`)],
    [t('Ano'), sumSince(`${today.slice(0, 4)}-01-01`)],
  ];
  const maxWeek = Math.max(1, ...stats.weeks.map(w => w.meters));
  const kinds = kindsIn(runs);
  const shown = filterRuns(runs, { period, kind: kinds.includes(kind) ? kind : null }, today);
  const filtering = period !== 'tudo' || (kind && kinds.includes(kind));

  return (
    <section id="page-voce" className="page active">
      <div className="run-periods">
        {periods.map(([label, meters]) => (
          <div key={label} className="run-periods__item">
            <span>{label}</span>
            <strong>{formatKm(meters, 1)}</strong>
            <small>{t('km')}</small>
          </div>
        ))}
      </div>
      {monthSummary(runs, today) && <SummaryShare runs={runs} today={today} />}

      <div className="dash-card">
        <div className="summary-stats run-stats">
          <div className="stat-card">
            <span className="stat-card__value">{formatKm(stats.totalM, 1)}</span>
            <span className="stat-card__label">{t('km no total')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{stats.count}</span>
            <span className="stat-card__label">{t('corridas')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{formatPace(stats.bestPace)}</span>
            <span className="stat-card__label">{t('Melhor ritmo (min/km)')}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{formatKm(stats.longestM, 1)}</span>
            <span className="stat-card__label">{t('Maior distância (km)')}</span>
          </div>
        </div>
      </div>

      <div className="section-group">
        <div className="section-group__label">{t('Recordes')}</div>
        <div className="run-records run-stats">
          {EFFORT_KM.map(k => (
            <div key={k} className="stat-card">
              <span className="stat-card__value">{stats.efforts[k] === null ? '–' : formatClock(stats.efforts[k])}</span>
              <span className="stat-card__label">{EFFORT_LABEL[k]}</span>
            </div>
          ))}
        </div>
        <p className="profile-field__hint">{t('Melhor tempo em cada distância, medido pelo GPS dentro de qualquer corrida.')}</p>
      </div>

      <RunInsights runs={runs} meta={user.user_metadata} />

      <div className="section-group">
        <div className="section-group__label">{t('Quilômetros por semana')}</div>
        <div className="dash-card run-weeks" role="img" aria-label={t('Quilômetros por semana')}>
          {stats.weeks.map(w => (
            <div key={w.start} className="run-weeks__col">
              <span className="run-weeks__value">{formatKm(w.meters, 1)}</span>
              <span className="run-weeks__bar" style={{ height: `${Math.round((w.meters / maxWeek) * 100)}%` }} />
              <span className="run-weeks__label">{fmtDate(w.start)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section-group">
        <div className="section-group__label">{t('Corridas')}</div>
        {runs.length > 1 && (
          <div className="run-filters">
            <div className="run-chips" role="group" aria-label={t('Período')}>
              {PERIODS.map(p => (
                <button key={p.key} type="button" aria-pressed={period === p.key} className={`run-chip${period === p.key ? ' run-chip--on' : ''}`} onClick={() => setPeriod(p.key)}>{p.label()}</button>
              ))}
            </div>
            {kinds.length > 1 && (
              <div className="run-chips" role="group" aria-label={t('Tipo de corrida')}>
                <button type="button" aria-pressed={!kind} className={`run-chip${!kind ? ' run-chip--on' : ''}`} onClick={() => setKind(null)}>{t('Todos os tipos')}</button>
                {kinds.map(k => (
                  <button key={k} type="button" aria-pressed={kind === k} className={`run-chip${kind === k ? ' run-chip--on' : ''}`} onClick={() => setKind(k)}>{SESSION_TITLE[k]}</button>
                ))}
              </div>
            )}
            {filtering && <p className="profile-field__hint" role="status">{t('{v1} de {v2} corridas', { v1: shown.length, v2: runs.length })}</p>}
          </div>
        )}
        {shown.length === 0 ? (
          <div className="empty-state">
            <p>{t('Nenhuma corrida com esses filtros.')}</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { const next = { period: 'tudo', kind: null }; setFilters(next); writeFilters(next); }}>{t('Limpar filtros')}</button>
          </div>
        ) : (
          <ul className="run-list">
            {shown.map(r => <RunItem key={r.client_id} run={r} runs={runs} shoe={shoes.find(s => s.id === r.shoe_id)} onDelete={handleDelete} />)}
          </ul>
        )}
      </div>

      <RunShoes userId={user.id} shoes={shoes} runs={runs} onChange={loadShoes} />

      <PrivacyZones />
    </section>
  );
}
