import { projectRoute } from './route';

import { t } from '../../lib/i18n';
// Desenho do percurso (route.js): só a linha do trajeto, sem mapa de fundo —
// nenhum serviço de fora recebe a localização. Some sem percurso.
export default function RouteDrawing({ route, width = 320, height = 180, className = '', label }) {
  const drawing = projectRoute(route, width, height, 12);
  if (!drawing) return null;
  return (
    <svg
      className={`run-route ${className}`.trim()} viewBox={`0 0 ${width} ${height}`}
      role="img" aria-label={label || t('Desenho do percurso')}
    >
      {drawing.paths.map((d, i) => <path key={i} d={d} className="run-route__line" />)}
      <circle cx={drawing.start[0]} cy={drawing.start[1]} r="5" className="run-route__start" />
      <circle cx={drawing.end[0]} cy={drawing.end[1]} r="5" className="run-route__end" />
    </svg>
  );
}
