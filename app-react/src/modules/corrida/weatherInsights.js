import { cleanWeather } from './weather';
import { paceSeconds } from './runs';

// Como o clima mexe no seu ritmo: as corridas que têm clima salvo, agrupadas
// pela temperatura do começo, com o ritmo médio de cada grupo.

export const MIN_WEATHER_RUNS = 3; // abaixo disso o resumo engana

// Faixas por temperatura (°C): frio até 15, ameno de 16 a 27, calor a partir de 28.
export const BANDS = [
  { key: 'frio', max: 15 },
  { key: 'ameno', max: 27 },
  { key: 'calor', max: Infinity },
];

export const bandOf = temp => BANDS.find(b => temp <= b.max).key;

// null sem corridas com clima o bastante. Ritmo só de corridas de 1 km ou mais.
export function weatherBands(runs) {
  const withWeather = runs
    .map(r => ({ w: cleanWeather(r.weather), pace: paceSeconds(r.duration_s, r.distance_m) }))
    .filter(x => x.w);
  if (withWeather.length < MIN_WEATHER_RUNS) return null;
  const bands = BANDS.map(b => {
    const mine = withWeather.filter(x => bandOf(x.w.t) === b.key);
    const paces = mine.map(x => x.pace).filter(p => p !== null);
    return {
      key: b.key,
      runs: mine.length,
      pace: paces.length ? Math.round(paces.reduce((s, p) => s + p, 0) / paces.length) : null,
    };
  }).filter(b => b.runs > 0);
  const avgTemp = Math.round(withWeather.reduce((s, x) => s + x.w.t, 0) / withWeather.length);
  // A faixa mais rápida só vale comparando pelo menos duas com ritmo.
  const timed = bands.filter(b => b.pace !== null);
  const fastest = timed.length >= 2 ? timed.reduce((a, b) => (b.pace < a.pace ? b : a)).key : null;
  return { total: withWeather.length, avgTemp, bands, fastest };
}
