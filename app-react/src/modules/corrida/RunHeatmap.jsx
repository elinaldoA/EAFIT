import { useMemo } from 'react';
import RouteDrawing from './RouteDrawing';
import { heatmapRoute } from './runHeat';
import { t } from '../../lib/i18n';

// Mapa de calor pessoal: todos os seus percursos juntos; onde se repetem, o traço
// fica mais forte. Tocar abre em tela cheia, com zoom.
export default function RunHeatmap({ runs }) {
  const heat = useMemo(() => heatmapRoute(runs), [runs]);
  if (!heat || heat.runs < 2) return null;
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Mapa de calor')}</div>
      <div className="dash-card">
        <RouteDrawing route={heat.route} heat width={320} height={300} label={t('Mapa de calor das suas corridas')} />
        <p className="profile-field__hint">
          {t('{v1} corridas no mesmo mapa. Os trechos que você mais repete ficam mais fortes.', { v1: heat.runs })}
          {heat.hidden > 0 ? ` ${t('{v1} de outras regiões não aparecem.', { v1: heat.hidden })}` : ''}
        </p>
      </div>
    </div>
  );
}
