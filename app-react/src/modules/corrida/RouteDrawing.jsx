import { useState } from 'react';
import { mapView, kmPoints, paceRuns, TILE_SIZE } from './route';
import { t } from '../../lib/i18n';
import { tileSrc, PACE_COLORS, kmStep } from './mapStyle';

const pct = (v, total) => `${(v / total) * 100}%`;

// Percurso sobre o mapa de ruas. O percurso salvo já vem sem os primeiros e
// os últimos 200 m (route.js). Sem internet os blocos não carregam e fica só a
// linha, como antes. Some sem percurso.
// `detail` (tela da corrida): linha colorida pelo ritmo e marcas de km, quando
// o percurso tem o tempo de cada ponto (route.js) e `splits` vem junto.
export default function RouteDrawing({ route, splits, detail = false, width = 320, height = 180, className = '', label }) {
  const view = mapView(route, width, height);
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
    <div
      className={`run-route run-map ${className}`.trim()}
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img" aria-label={label || t('Mapa do percurso')}
    >
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
