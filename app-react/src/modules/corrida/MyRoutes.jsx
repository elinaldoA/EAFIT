import { useMemo, useState } from 'react';
import { fmtDate } from '../../lib/utils';
import { formatClock, formatKm, formatPace, paceSeconds, runTitle } from './runs';
import { groupRoutes, ghostFrom, routeProgress } from './ghost';
import RouteDrawing from './RouteDrawing';

import { t } from '../../lib/i18n';
const SHOWN = 3;

// Os últimos tempos da rota em barras (mais alta = mais rápida) e a diferença
// da última corrida para a primeira e para a melhor.
function RouteTrend({ group }) {
  const p = routeProgress(group);
  if (!p) return null;
  const fastest = Math.min(...p.times);
  const text = p.vsBest === 0
    ? t('🔥 A última foi a sua melhor nesta rota')
    : p.vsBest > 0 ? t('{v1} s mais lenta que a melhor', { v1: p.vsBest }) : '';
  const first = p.vsFirst === 0 ? '' : p.vsFirst < 0
    ? t('{v1} mais rápida que a primeira', { v1: formatClock(-p.vsFirst) })
    : t('{v1} mais lenta que a primeira', { v1: formatClock(p.vsFirst) });
  return (
    <>
      <span className="run-trendbars" role="img" aria-label={t('Tempos nesta rota, do mais antigo ao mais recente')}>
        {p.times.map((s, i) => <i key={i} style={{ height: `${Math.round((fastest / s) * 100)}%` }} />)}
      </span>
      <span>{[first, text].filter(Boolean).join(' · ')}</span>
    </>
  );
}

// "Minhas rotas": percursos que você já correu mais de uma vez (a mesma
// estimativa do "correr contra a melhor da rota"), com um toque para correr
// de novo contra o seu melhor tempo ali. Sai das corridas salvas, sem tabela.
export default function MyRoutes({ runs, onRunAgainst }) {
  const groups = useMemo(() => groupRoutes(runs), [runs]);
  const [all, setAll] = useState(false);
  if (!groups.length) return null;
  const list = all ? groups : groups.slice(0, SHOWN);
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Minhas rotas')}</div>
      <ul className="run-list">
        {list.map(g => (
          <li key={g.last.client_id} className="dash-card run-route">
            <RouteDrawing route={g.last.route} width={96} height={72} className="run-route__map" />
            <div className="run-route__info">
              <strong>{runTitle(g.last)}</strong>
              <span>{t('{v1} km · {v2} vezes · última em {v3}', { v1: formatKm(g.last.distance_m, 1), v2: g.count, v3: fmtDate(g.last.run_date) })}</span>
              <span>{t('👑 Melhor: {v1} ({v2}/km)', { v1: formatClock(g.best.duration_s), v2: formatPace(paceSeconds(g.best.duration_s, g.best.distance_m)) })}</span>
              <RouteTrend group={g} />
              {ghostFrom(g.best) && (
                <button type="button" className="btn btn--outline btn--sm" onClick={() => onRunAgainst(ghostFrom(g.best))}>
                  {t('🏁 Correr de novo contra a melhor')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {groups.length > SHOWN && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(a => !a)}>
          {all ? t('Ver menos') : t('Ver todas as rotas ({v1})', { v1: groups.length })}
        </button>
      )}
    </div>
  );
}
