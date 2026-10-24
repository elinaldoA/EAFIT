import { useState } from 'react';
import { trackFeature } from '../lib/tracking';
import {
  ALL_PLATES, BAR_OPTIONS, plateKind, platesPerSide, readBar, saveBar, readPlates, savePlates,
} from '../lib/plates';

import { t, locale } from '../lib/i18n';

const kg = v => v.toLocaleString(locale);

// Calculadora de anilhas do exercício (ver lib/plates.js): fechada, é só um
// botão; aberta, parte da carga da série em andamento (a primeira não marcada
// com carga, senão a da Série 1) e deixa trocar a carga, a barra e as anilhas
// que a academia tem.
export default function PlateCalc({ ex, setCount }) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [bar, setBar] = useState(() => readBar(ex.nome));
  const [plates, setPlates] = useState(readPlates);
  const [editPlates, setEditPlates] = useState(false);
  const kind = plateKind(ex.nome);
  if (!kind) return null;

  function currentLoad() {
    let first = '';
    for (let n = 1; n <= setCount; n++) {
      const carga = localStorage.getItem(`set_${ex.nome}_${n}_carga`) || '';
      if (n === 1) first = carga;
      if (carga && localStorage.getItem(`set_${ex.nome}_${n}_done`) !== 'true') return carga;
    }
    return first;
  }

  function toggle() {
    if (!open) {
      setWeight(currentLoad());
      trackFeature('plate_calc');
    }
    setOpen(o => !o);
  }

  function chooseBar(b) {
    setBar(b);
    saveBar(ex.nome, b);
  }

  function togglePlate(p) {
    const next = plates.includes(p) ? plates.filter(x => x !== p) : ALL_PLATES.filter(x => x === p || plates.includes(x));
    if (!next.length) return;
    setPlates(next);
    savePlates(next);
  }

  const result = platesPerSide(weight, bar, plates);

  return (
    <div className="plates">
      <button type="button" className="plates__toggle" aria-expanded={open} onClick={toggle}>
        {t('🧮 Anilhas {v1}', { v1: open ? '▲' : '▼' })}
      </button>
      {open && (
        <div className="plates__panel">
          <div className="plates__row">
            <label className="plates__label" htmlFor={`plates-${ex.nome}`}>{t('Carga total')}</label>
            <input
              id={`plates-${ex.nome}`} className="input input--sm plates__input"
              type="text" inputMode="decimal" placeholder="kg" autoComplete="off"
              value={weight} onChange={e => setWeight(e.target.value)}
            />
          </div>
          <div className="plates__row">
            <span className="plates__label">{kind === 'sled' ? t('Aparelho') : t('Barra')}</span>
            <div className="plates__chips" role="radiogroup" aria-label={t('Peso da barra')}>
              {BAR_OPTIONS.map(b => (
                <button
                  key={b} type="button" role="radio" aria-checked={bar === b}
                  className={`plates__chip${bar === b ? ' plates__chip--on' : ''}`}
                  onClick={() => chooseBar(b)}
                >{b ? `${b} kg` : t('não conta')}</button>
              ))}
            </div>
          </div>

          {result && (result.belowBar ? (
            <p className="plates__msg">{t('A carga é menor que a barra ({bar} kg).', { bar: kg(bar) })}</p>
          ) : (
            <>
              <div className="plates__bar" aria-hidden="true">
                <span className="plates__sleeve" />
                {result.perSide.map((p, i) => (
                  <span key={i} className={`plate plate--${String(p).replace('.', '_')}`} style={{ '--h': `${40 + Math.min(p, 25) * 2.4}%` }}>{kg(p)}</span>
                ))}
              </div>
              <p className="plates__result">
                {result.perSide.length
                  ? t('Cada lado: {plates}', { plates: result.perSide.map(kg).join(' + ') })
                  : t('Só a barra, sem anilhas')}
              </p>
              {result.remainder > 0 && (
                <p className="plates__msg">{t('Fecha em {loaded} kg — faltam {rest} kg que as anilhas disponíveis não completam.', { loaded: kg(result.loaded), rest: kg(result.remainder) })}</p>
              )}
            </>
          ))}

          <button type="button" className="plates__edit" onClick={() => setEditPlates(v => !v)}>
            {t('Anilhas da sua academia {v1}', { v1: editPlates ? '▲' : '▼' })}
          </button>
          {editPlates && (
            <div className="plates__chips">
              {ALL_PLATES.map(p => (
                <button
                  key={p} type="button" aria-pressed={plates.includes(p)}
                  className={`plates__chip${plates.includes(p) ? ' plates__chip--on' : ''}`}
                  onClick={() => togglePlate(p)}
                >{kg(p)}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
