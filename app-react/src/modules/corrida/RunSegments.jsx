import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { fmtDate } from '../../lib/utils';
import { formatClock, formatKm, formatPace, RUN_SAVED_EVENT } from './runs';
import { fetchSegments, fetchMyEfforts, syncEfforts, fetchLeaderboard, deleteSegment, setSegmentVisibility } from './segmentStore';
import RouteDrawing from './RouteDrawing';
import { t } from '../../lib/i18n';

function Leaderboard({ segment }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchLeaderboard(segment.id).then(list => { if (alive) setRows(list); });
    return () => { alive = false; };
  }, [segment.id]);
  if (rows === null) return <div className="skeleton" style={{ height: 60 }} />;
  if (!rows.length) return <p className="profile-field__hint">{t('Ainda sem tempo neste segmento. Corra por ele (com GPS) para entrar no placar.')}</p>;
  return (
    <ol className="run-segments__board" aria-label={t('Placar do segmento')}>
      {rows.map(r => (
        <li key={`${r.rank}-${r.name}-${r.seconds}`} className={r.isMe ? 'run-segments__me' : ''}>
          <span className="run-segments__rank">{r.rank}º</span>
          <span className="run-segments__name">{r.isMe ? t('Você') : r.name}</span>
          <strong>{formatClock(r.seconds)}</strong>
          <small>{formatPace(Math.round(r.seconds / (segment.distance_m / 1000)))}/km · {fmtDate(r.date)}</small>
        </li>
      ))}
    </ol>
  );
}

// Seção Segmentos da aba Você: os seus segmentos e os dos amigos, o seu melhor tempo
// em cada um e o placar. Ao abrir, calcula os tempos das corridas ainda não conferidas.
// `runs`: as corridas já carregadas (com percurso).
export default function RunSegments({ runs }) {
  const { user } = useAuth();
  const toast = useToast();
  const [segments, setSegments] = useState(null);
  const [best, setBest] = useState(new Map());
  const [openId, setOpenId] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const list = await fetchSegments();
    setSegments(list);
    if (!list.length) return;
    setSyncing(true);
    try {
      let { known, best: mine } = await fetchMyEfforts(user.id);
      const added = await syncEfforts(user.id, list, runs, known);
      if (added) ({ best: mine } = await fetchMyEfforts(user.id));
      setBest(mine);
    } catch (err) {
      console.error('RunSegments:', err);
    } finally {
      setSyncing(false);
    }
  }, [user, runs]);

  useEffect(() => {
    load();
    window.addEventListener(RUN_SAVED_EVENT, load);
    return () => window.removeEventListener(RUN_SAVED_EVENT, load);
  }, [load]);

  async function handleVisibility(seg) {
    const next = seg.visibility === 'amigos' ? 'privado' : 'amigos';
    if (next === 'amigos' && !window.confirm(t('Mostrar este segmento aos amigos? Eles verão onde ele começa e termina.'))) return;
    try {
      await setSegmentVisibility(user.id, seg.id, next);
      await load();
    } catch {
      toast(t('⚠️ Não foi possível mudar — tente novamente'));
    }
  }

  async function handleDelete(seg) {
    if (!window.confirm(t('Apagar o segmento "{v1}"? Os tempos nele também somem.', { v1: seg.name }))) return;
    try {
      await deleteSegment(user.id, seg.id);
      await load();
    } catch {
      toast(t('⚠️ Não foi possível apagar — tente novamente'));
    }
  }

  if (!segments?.length) {
    return (
      <div className="section-group">
        <div className="section-group__label">{t('Segmentos')}</div>
        <p className="profile-field__hint">{t('Abra uma corrida com GPS e toque em "Criar segmento" para comparar um trecho sempre que passar por ele.')}</p>
      </div>
    );
  }
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Segmentos')}{syncing ? ` · ${t('conferindo…')}` : ''}</div>
      <ul className="run-segments">
        {segments.map(seg => {
          const mine = best.get(seg.id);
          const open = openId === seg.id;
          return (
            <li key={seg.id} className="dash-card run-segments__item">
              <button type="button" className="run-segments__head" aria-expanded={open} onClick={() => setOpenId(open ? null : seg.id)}>
                <strong>{seg.name}{seg.visibility === 'amigos' ? ' 👥' : ' 🔒'}</strong>
                <span>{t('{v1} km', { v1: formatKm(seg.distance_m) })} · {mine ? t('seu melhor: {v1}', { v1: formatClock(mine.seconds) }) : t('sem tempo seu ainda')}</span>
                {!seg.isMine && <small>{t('de {v1}', { v1: seg.owner })}</small>}
              </button>
              {open && (
                <div className="run-segments__body">
                  <RouteDrawing route={[seg.route]} width={320} height={140} />
                  <Leaderboard segment={seg} />
                  {seg.isMine && (
                    <div className="run-item__actions">
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => handleVisibility(seg)}>
                        {seg.visibility === 'amigos' ? t('🔒 Deixar privado') : t('👥 Mostrar aos amigos')}
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => handleDelete(seg)}>{t('Apagar segmento')}</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
