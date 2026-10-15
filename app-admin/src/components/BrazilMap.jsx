import { BR_STATES, BR_VIEWBOX } from '../lib/brazilStates';
import { colorStep, legendSteps } from '../lib/geo';

// Estados pequenos demais pra caber a sigla dentro do contorno.
const NO_LABEL = new Set(['DF', 'SE', 'AL', 'PB', 'RN', 'ES', 'RJ']);

// O contorno de Goiás cobre o DF: o DF vai por último pra ficar por cima.
const DRAW_ORDER = [...BR_STATES].sort((a, b) => (a.uf === 'DF') - (b.uf === 'DF'));

// Mapa coroplético do Brasil: cor do estado proporcional ao total. Clicar (ou
// Enter/Espaço) seleciona o estado; clicar de novo limpa a seleção.
export default function BrazilMap({ byUf, max, selected, onSelect, unit = 'visitas' }) {
  const toggle = uf => onSelect(selected === uf ? null : uf);

  return (
    <figure className="br-map">
      <svg viewBox={BR_VIEWBOX} role="group" aria-label={`Mapa do Brasil por estado (${unit})`}>
        {DRAW_ORDER.map(s => {
          const total = byUf.get(s.uf) || 0;
          const step = colorStep(total, max);
          return (
            <path
              key={s.uf}
              d={s.d}
              className={`br-map__state br-map__state--s${step}${selected === s.uf ? ' br-map__state--sel' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={selected === s.uf}
              aria-label={`${s.name}: ${total} ${unit}`}
              onClick={() => toggle(s.uf)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s.uf); } }}
            >
              <title>{`${s.name}: ${total} ${unit}`}</title>
            </path>
          );
        })}
        {BR_STATES.filter(s => !NO_LABEL.has(s.uf)).map(s => (
          <text
            key={s.uf} x={s.cx} y={s.cy}
            className={`br-map__label${colorStep(byUf.get(s.uf) || 0, max) >= 4 ? ' br-map__label--on-dark' : ''}`}
            aria-hidden="true"
          >
            {s.uf}
          </text>
        ))}
      </svg>
      {max > 0 && (
        <figcaption className="br-map__legend">
          {legendSteps(max).map(l => (
            <span key={l.step} className="br-map__key">
              <span className={`br-map__swatch br-map__state--s${l.step}`} aria-hidden="true" />
              {l.from === l.to ? l.from : `${l.from}–${l.to}`}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
