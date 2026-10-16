import { legendSteps } from '../lib/geo';

// Legenda das faixas de cor dos mapas (Brasil e mundo).
export default function MapLegend({ max }) {
  if (!max) return null;
  return (
    <figcaption className="br-map__legend">
      {legendSteps(max).map(l => (
        <span key={l.step} className="br-map__key">
          <span className={`br-map__swatch br-map__state--s${l.step}`} aria-hidden="true" />
          {l.from === l.to ? l.from : `${l.from}–${l.to}`}
        </span>
      ))}
    </figcaption>
  );
}
