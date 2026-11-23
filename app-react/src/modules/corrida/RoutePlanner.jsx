import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { trackFeature } from '../../lib/tracking';
import { downloadText } from './gpx';
import { cachedRuns, formatKm, formatClock, formatPace } from './runs';
import { tileSrc } from './mapStyle';
import { TILE_SIZE } from './route';
import {
  planView, panCenter, clampZoom, planDistanceM, estimateSeconds, averagePace,
  addPlanPoint, closeLoop, outAndBack, buildPlanGpx,
} from './routePlan';
import { t } from '../../lib/i18n';

const W = 340;
const H = 340;
const FALLBACK = { lat: -23.55, lon: -46.63 };
const TAP_SLOP = 6;
const pct = (v, total) => `${(v / total) * 100}%`;

// Onde abrir o mapa: o começo da última corrida com percurso; sem ela, uma cidade qualquer
// (a pessoa toca em "Minha localização" ou arrasta).
function startCenter(userId) {
  const run = cachedRuns(userId).find(r => Array.isArray(r.route) && r.route[0]?.length);
  const p = run?.route?.[0]?.[0];
  return p ? { lat: p[0] / 1e5, lon: p[1] / 1e5 } : FALLBACK;
}

// Planejar um percurso: toque no mapa para marcar os pontos (arraste para mover o mapa),
// veja a distância e o tempo no seu ritmo e baixe o GPX para o relógio. A linha liga os
// pontos em reta: o app não traça pelas ruas, então marque pontos nas curvas.
export default function RoutePlanner({ onClose }) {
  const { user } = useAuth();
  const [center, setCenter] = useState(() => startCenter(user?.id));
  const [zoom, setZoom] = useState(14);
  const [points, setPoints] = useState([]);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(() => new Set());
  const drag = useRef(null);
  const frame = useRef(null);

  const view = useMemo(() => planView(center, zoom, W, H), [center, zoom]);
  const pace = useMemo(() => averagePace(cachedRuns(user?.id)), [user?.id]);
  const distance = planDistanceM(points);
  const seconds = estimateSeconds(distance, pace);
  const hasMap = view.tiles.some(tile => !failed.has(tileSrc(tile)));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${view.place(p).join(' ')}`).join('');

  // Do toque na tela para o quadro lógico W×H do mapa.
  const local = e => {
    const r = frame.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  function onPointerDown(e) {
    if (e.target.closest('button, a')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y] = local(e);
    drag.current = { x, y, startX: x, startY: y, moved: false };
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const [x, y] = local(e);
    if (!d.moved && Math.hypot(x - d.startX, y - d.startY) < TAP_SLOP) return;
    d.moved = true;
    const dx = x - d.x;
    const dy = y - d.y;
    d.x = x;
    d.y = y;
    setCenter(c => panCenter(c, zoom, dx, dy));
  }
  function onPointerUp(e) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || e.type === 'pointercancel') return;
    setPoints(list => addPlanPoint(list, view.invert(d.startX, d.startY)));
  }

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setZoom(15); setLocating(false); },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  function download() {
    trackFeature('run_route_plan');
    downloadText('eafit-rota.gpx', buildPlanGpx(points, t('Rota planejada')), 'application/gpx+xml');
  }

  return (
    <div className="dash-card run-plan">
      <strong>{t('🗺️ Planejar uma rota')}</strong>
      <p className="profile-field__hint">{t('Toque no mapa para marcar os pontos do percurso e arraste para mover o mapa. A linha liga os pontos em reta: marque pontos nas curvas para seguir as ruas.')}</p>
      <div
        ref={frame} className="run-route run-map run-plan__map" style={{ aspectRatio: `${W} / ${H}` }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        role="application" aria-label={t('Mapa para planejar a rota')}
      >
        {hasMap && (
          <div className="run-map__tiles" aria-hidden="true">
            {view.tiles.map(tile => (
              <img
                key={`${tile.z}/${tile.x}/${tile.y}/${tile.left}`}
                src={tileSrc(tile)} alt="" decoding="async" draggable="false" crossOrigin="anonymous"
                referrerPolicy="strict-origin-when-cross-origin"
                style={{ left: pct(tile.left, W), top: pct(tile.top, H), width: pct(TILE_SIZE, W), height: pct(TILE_SIZE, H) }}
                onError={e => {
                  e.currentTarget.style.visibility = 'hidden';
                  const src = tileSrc(tile);
                  setFailed(prev => (prev.has(src) ? prev : new Set(prev).add(src)));
                }}
              />
            ))}
          </div>
        )}
        <svg className="run-map__route" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {points.length > 1 && (
            <>
              <path d={path} className="run-route__casing" />
              <path d={path} className="run-route__line" />
            </>
          )}
          {points.map((p, i) => {
            const [x, y] = view.place(p);
            return <circle key={i} cx={x} cy={y} r={i === 0 ? 6 : 4} className={i === 0 ? 'run-route__start' : 'run-plan__dot'} />;
          })}
        </svg>
        <div className="run-plan__zoom">
          <button type="button" aria-label={t('Aproximar')} disabled={view.zoom >= 18} onClick={() => setZoom(z => clampZoom(z + 1))}>+</button>
          <button type="button" aria-label={t('Afastar')} disabled={view.zoom <= 3} onClick={() => setZoom(z => clampZoom(z - 1))}>−</button>
        </div>
        {hasMap && (
          <a className="run-map__credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>
        )}
      </div>

      <div className="run-plan__stats" aria-live="polite">
        <div><strong>{formatKm(distance, 2)} km</strong><small>{t('distância')}</small></div>
        <div>
          <strong>{seconds === null ? '–' : formatClock(seconds)}</strong>
          <small>{pace === null ? t('sem corridas para estimar') : t('no seu ritmo de {v1}/km', { v1: formatPace(pace) })}</small>
        </div>
      </div>

      <div className="run-item__actions">
        <button type="button" className="btn btn--outline btn--sm" disabled={!points.length} onClick={() => setPoints(l => l.slice(0, -1))}>{t('↩️ Desfazer')}</button>
        <button type="button" className="btn btn--outline btn--sm" disabled={points.length < 2} onClick={() => setPoints(closeLoop)}>{t('🔁 Fechar circuito')}</button>
        <button type="button" className="btn btn--outline btn--sm" disabled={points.length < 2} onClick={() => setPoints(outAndBack)}>{t('↔️ Ida e volta')}</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!points.length} onClick={() => setPoints([])}>{t('Limpar')}</button>
        <button type="button" className="btn btn--outline btn--sm" disabled={locating} onClick={locate}>{locating ? t('Localizando…') : t('📍 Minha localização')}</button>
      </div>
      <div className="run-item__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={points.length < 2} onClick={download}>{t('⬇️ Baixar GPX')}</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{t('Fechar')}</button>
      </div>
    </div>
  );
}
