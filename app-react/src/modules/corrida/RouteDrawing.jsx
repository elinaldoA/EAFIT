import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mapView, kmPoints, paceRuns, TILE_SIZE, MAX_FULL_ZOOM } from './route';
import { t } from '../../lib/i18n';
import { tileSrc, PACE_COLORS, kmStep } from './mapStyle';
import { useBackToClose } from '../../hooks/useBackToClose';
import { getModalRoot } from '../../lib/modalRoot';

const pct = (v, total) => `${(v / total) * 100}%`;

// O mapa em si: blocos do OpenStreetMap + percurso em SVG, num quadro w×h.
// O percurso salvo já vem sem os primeiros e os últimos 200 m e sem as zonas
// de privacidade (route.js). Sem internet os blocos não carregam e fica só a
// linha. `detail`: linha colorida pelo ritmo e marcas de km, quando o
// percurso tem o tempo de cada ponto e `splits` vem junto.
function MapCanvas({ route, splits, detail, width, height, zoomDelta = 0, pan, className = '', style, ...rest }) {
  const view = mapView(route, width, height, 16, { zoomDelta, pan });
  // Blocos que não carregaram (sem internet). Se nenhum carregar, some também
  // o crédito do mapa e fica só a linha.
  const [failed, setFailed] = useState(() => new Set());
  if (!view) return null;
  const hasMap = view.tiles.some(tile => !failed.has(tileSrc(tile)));
  const pace = detail ? paceRuns(route) : [];
  const kms = detail ? kmPoints(route, splits) : [];
  const step = kmStep(kms.length);
  const toPath = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${view.place(p).join(' ')}`).join('');
  return (
    <div className={`run-route run-map ${className}`.trim()} style={style} {...rest}>
      {hasMap && (
        <div className="run-map__tiles" aria-hidden="true">
          {view.tiles.map(tile => (
            <img
              key={`${tile.z}/${tile.x}/${tile.y}/${tile.left}`}
              src={tileSrc(tile)} alt="" loading="lazy" decoding="async" draggable="false" crossOrigin="anonymous"
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ left: pct(tile.left, width), top: pct(tile.top, height), width: pct(TILE_SIZE, width), height: pct(TILE_SIZE, height) }}
              onError={e => {
                e.currentTarget.style.visibility = 'hidden';
                const src = tileSrc(tile);
                setFailed(prev => (prev.has(src) ? prev : new Set(prev).add(src)));
              }}
            />
          ))}
        </div>
      )}
      <svg className="run-map__route" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {view.paths.map((d, i) => <path key={`c${i}`} d={d} className="run-route__casing" />)}
        {pace.length
          ? pace.map((run, i) => <path key={i} d={toPath(run.pts)} className="run-route__line" style={{ stroke: PACE_COLORS[run.level] }} />)
          : view.paths.map((d, i) => <path key={i} d={d} className="run-route__line" />)}
        <circle cx={view.start[0]} cy={view.start[1]} r="5.5" className="run-route__start" />
        <circle cx={view.end[0]} cy={view.end[1]} r="5.5" className="run-route__end" />
        {kms.filter(k => k.km % step === 0).map(k => {
          const [x, y] = view.place(k.p);
          return (
            <g key={k.km} className="run-route__km">
              <circle cx={x} cy={y} r="8" />
              <text x={x} y={y} dy="0.35em" textAnchor="middle">{k.km}</text>
            </g>
          );
        })}
      </svg>
      {pace.length > 0 && (
        <span className="run-map__legend" aria-hidden="true">
          {t('lento')}
          {PACE_COLORS.map(c => <i key={c} style={{ background: c }} />)}
          {t('rápido')}
        </span>
      )}
      {hasMap && (
        <a className="run-map__credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          © OpenStreetMap
        </a>
      )}
    </div>
  );
}

function readViewport() {
  return { w: window.innerWidth || 360, h: window.innerHeight || 640 };
}

function useViewport() {
  const [size, setSize] = useState(readViewport);
  useEffect(() => {
    const onResize = () => setSize(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

// Mapa em tela cheia: arrastar com o dedo, pinça ou + / − para o zoom, toque
// duplo aproxima. Fecha no ✕ ou no "voltar" do celular.
function MapFullscreen({ route, splits, onClose }) {
  useBackToClose(onClose);
  const { w, h } = useViewport();
  const [zoom, setZoom] = useState(0);
  const [pan, setPan] = useState([0, 0]);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const lastTap = useRef(0);
  const fitZ = mapView(route, w, h)?.fitZ ?? 0;

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  // Muda o zoom mantendo o mesmo centro (o deslocamento cresce junto).
  function zoomBy(delta) {
    const next = Math.max(-6, Math.min(MAX_FULL_ZOOM - fitZ, zoom + delta));
    if (next === zoom) return;
    const k = 2 ** (next - zoom);
    setZoom(next);
    setPan(p => [p[0] * k, p[1] * k]);
  }

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function onPointerDown(e) {
    if (e.target.closest('button, a')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = dist();
    if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) zoomBy(1);
      lastTap.current = now;
    }
  }

  function onPointerMove(e) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && pinch.current) {
      const ratio = dist() / pinch.current;
      if (ratio > 1.6) { zoomBy(1); pinch.current = dist(); } else if (ratio < 0.62) { zoomBy(-1); pinch.current = dist(); }
      return;
    }
    if (pointers.current.size === 1) setPan(p => [p[0] - (cur.x - prev.x), p[1] - (cur.y - prev.y)]);
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  return createPortal(
    <div className="run-map-full" role="dialog" aria-modal="true" aria-label={t('Mapa do percurso')}>
      <MapCanvas
        route={route} splits={splits} detail width={w} height={h} zoomDelta={zoom} pan={pan}
        className="run-map--full" style={{ width: w, height: h }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onWheel={e => zoomBy(e.deltaY < 0 ? 1 : -1)}
      />
      <button type="button" className="run-map-full__close" aria-label={t('Fechar mapa')} onClick={onClose}>✕</button>
      <div className="run-map-full__zoom">
        <button type="button" aria-label={t('Aproximar')} onClick={() => zoomBy(1)}>+</button>
        <button type="button" aria-label={t('Afastar')} onClick={() => zoomBy(-1)}>−</button>
        <button type="button" aria-label={t('Ver o percurso inteiro')} onClick={() => { setZoom(0); setPan([0, 0]); }}>⤢</button>
      </div>
    </div>,
    getModalRoot(),
  );
}

// Percurso sobre o mapa de ruas, em todas as telas da corrida. Tocar abre o
// mapa em tela cheia. Some sem percurso.
export default function RouteDrawing({ route, splits, detail = false, width = 320, height = 180, className = '', label }) {
  const [full, setFull] = useState(false);
  if (!mapView(route, width, height)) return null;
  return (
    <>
      <MapCanvas
        route={route} splits={splits} detail={detail} width={width} height={height}
        className={`run-map--tap ${className}`.trim()} style={{ aspectRatio: `${width} / ${height}` }}
        role="button" tabIndex={0}
        aria-label={`${label || t('Mapa do percurso')}. ${t('Toque para ver em tela cheia')}`}
        onClick={e => { if (!e.target.closest('a')) setFull(true); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFull(true); } }}
      />
      {full && <MapFullscreen route={route} splits={splits} onClose={() => setFull(false)} />}
    </>
  );
}
