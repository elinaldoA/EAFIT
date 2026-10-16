import { WORLD_COUNTRIES, WORLD_VIEWBOX } from '../lib/worldCountries';
import { colorStep, countryName } from '../lib/geo';
import MapLegend from './MapLegend';

// Mapa coroplético do mundo: cor do país proporcional ao total. Clicar (ou
// Enter/Espaço) seleciona o país; clicar de novo limpa a seleção. Carregado
// sob demanda (React.lazy) por causa do tamanho dos contornos.
export default function WorldMap({ byCountry, max, selected, onSelect, unit = 'visitas' }) {
  const toggle = code => onSelect(selected === code ? null : code);

  return (
    <figure className="br-map world-map">
      <svg viewBox={WORLD_VIEWBOX} role="group" aria-label={`Mapa do mundo por país (${unit})`}>
        {WORLD_COUNTRIES.map(c => {
          const total = byCountry.get(c.code) || 0;
          const label = `${countryName(c.code)}: ${total} ${unit}`;
          return (
            <path
              key={c.code}
              d={c.d}
              className={`br-map__state br-map__state--s${colorStep(total, max)}${selected === c.code ? ' br-map__state--sel' : ''}`}
              role="button"
              tabIndex={total ? 0 : -1}
              aria-pressed={selected === c.code}
              aria-label={label}
              onClick={() => toggle(c.code)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(c.code); } }}
            >
              <title>{label}</title>
            </path>
          );
        })}
      </svg>
      <MapLegend max={max} />
    </figure>
  );
}
