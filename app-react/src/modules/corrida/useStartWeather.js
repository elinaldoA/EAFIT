import { useEffect, useRef, useState } from 'react';
import { fetchWeatherAt } from './weather';

// Clima de agora no lugar onde a pessoa está, antes de começar a correr. Busca
// quando a posição aparece e de novo se passar de 20 min com a tela aberta.
// Só a posição arredondada a 0,1° vai ao serviço (weather.js). Sem posição ou
// sem internet fica null e a tela não mostra nada.
const REFRESH_MS = 20 * 60000;

export function useStartWeather(pos) {
  const [weather, setWeather] = useState(null);
  const lastAt = useRef(0);
  const has = !!pos;
  const lat = pos?.lat;
  const lon = pos?.lon;

  useEffect(() => {
    if (!has) return undefined;
    let alive = true;
    const load = async () => {
      lastAt.current = Date.now();
      const w = await fetchWeatherAt({ lat, lon });
      if (alive && w) setWeather(w);
    };
    load();
    const id = setInterval(() => { if (Date.now() - lastAt.current >= REFRESH_MS) load(); }, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [has, lat, lon]);

  return weather;
}
