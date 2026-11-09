import { useCallback, useEffect, useRef, useState } from 'react';
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
import RunShoes from './Shoes';
import { SESSION_TITLE } from './program';
import RouteDrawing from './RouteDrawing';
import PrivacyZones from './PrivacyZones';
import { renderRunCard, shareRunCard } from './runShareCard';
import RunPhotoShare from './RunPhotoShare';
import RunInsights from './RunInsights';

import { t } from '../../lib/i18n';
const EFFORT_LABEL = { 1: t('1 km'), 5: t('5 km'), 10: t('10 km'), 21: t('21 km') };

function RunItem({ run, shoe, onDelete }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
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
  return (
    <li className={`run-item${open ? ' run-item--open' : ''}`}>
      <button type="button" className="run-item__head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="run-item__date">{fmtDate(run.run_date)}</span>
        <span className="run-item__main">
          <strong>{runTitle(run)}{run.visibility === 'privado' ? ' 🔒' : ''}</strong>
          <span>{t('{v1} km', { v1: formatKm(run.distance_m) })}</span>
          <span>{formatClock(run.duration_s)} · {formatPace(pace)}/km</span>
        </span>
        <span className="run-item__kind">{SESSION_TITLE[run.kind] || SESSION_TITLE.livre}{run.pending ? ' · 📶' : ''}</span>
      </button>
      {open && (
        <div className="run-item__body">
          <RouteDrawing route={run.route} splits={run.splits} detail width={320} height={190} />
          {(run.elev_gain_m != null || run.cadence || shoe) && (
            <div className="run-live__extra run-item__extra">
              {run.elev_gain_m != null && <span>{t('↗ {v1} m de subida', { v1: run.elev_gain_m })}</span>}
              {run.cadence && <span>{t('👣 {v1} passos/min', { v1: run.cadence })}</span>}
              {shoe && <span>👟 {shoe.name}</span>}
            </div>
          )}
          {run.splits.length > 0 ? <SplitBars splits={run.splits} />
            : <p className="profile-field__hint">{t('Sem tempo por km (distância digitada).')}</p>}
          {run.effort && <p>{t('Esforço: {v1}/10', { v1: run.effort })}</p>}
          {run.notes && <p className="run-item__notes">{run.notes}</p>}
          {run.pending && <p className="profile-field__hint">{t('Ainda no aparelho: sobe quando houver internet.')}</p>}
          {run.route.length > 0 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadGpx(run)}>{t('📤 Exportar GPX')}</button>
          )}
          <button type="button" className="btn btn--primary btn--sm" disabled={sharing} onClick={handleShare}>
            {sharing ? t('Gerando imagem…') : t('📤 Compartilhar nos stories')}
          </button>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setPhotoOpen(true)}>
            {t('📸 Compartilhar com foto')}
          </button>
          <button
            type="button" className="btn btn--ghost btn--sm"
            onClick={() => { if (confirm) onDelete(run); else setConfirm(true); }}
          >{confirm ? t('Toque de novo para apagar') : t('Apagar corrida')}</button>
        </div>
      )}
      {photoOpen && <RunPhotoShare run={run} onClose={() => setPhotoOpen(false)} />}
    </li>
  );
}

// Aba Você do EAFIT Run: km da semana, do mês e do ano, totais, recordes, km
// por semana e a lista das suas corridas (inclusive as que ainda estão no aparelho).
export default function RunHistoryPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(false);
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

  async function handleDelete(run) {
    try {
      await deleteRun(user.id, run);
      setRuns(list => list.filter(r => r.client_id !== run.client_id));
      toast(t('Corrida apagada'));
    } catch (err) {
      console.error('deleteRun:', err);
      toast(t('⚠️ Não foi possível apagar — tente novamente'));
    }
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

      <div className="dash-card">
        <div className="summary-stats">
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
        <div className="run-records">
          {EFFORT_KM.map(k => (
            <div key={k} className="stat-card">
              <span className="stat-card__value">{stats.efforts[k] === null ? '–' : formatClock(stats.efforts[k])}</span>
              <span className="stat-card__label">{EFFORT_LABEL[k]}</span>
            </div>
          ))}
        </div>
        <p className="profile-field__hint">{t('Melhor tempo em cada distância, medido pelo GPS dentro de qualquer corrida.')}</p>
      </div>

      <RunInsights runs={runs} />

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
        <ul className="run-list">
          {runs.map(r => <RunItem key={r.client_id} run={r} shoe={shoes.find(s => s.id === r.shoe_id)} onDelete={handleDelete} />)}
        </ul>
      </div>

      <RunShoes userId={user.id} shoes={shoes} runs={runs} onChange={loadShoes} />

      <PrivacyZones />
    </section>
  );
}
