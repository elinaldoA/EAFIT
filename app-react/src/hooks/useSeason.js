import { useEffect, useState } from 'react';
import { useAppConfig } from '../context/useAppConfig';
import { activePeriod, cachedSeason, isSeasonOff, onSeasonChange } from '../lib/season';

// Tema de temporada no ar (lib/season.js). `available` é o tema do período de
// hoje, mesmo que a pessoa tenha desligado; `theme` é o que deve aparecer;
// `year`, o ano em que esse período começa. Até a configuração chegar, vale a
// última guardada no aparelho.
export function useSeason() {
  const { config, loaded } = useAppConfig();
  const [, setTick] = useState(0);
  useEffect(() => onSeasonChange(() => setTick(n => n + 1)), []);

  const season = loaded ? config.season : cachedSeason();
  const period = activePeriod(season);
  const available = period?.theme || '';
  const off = available ? isSeasonOff(available) : false;
  return {
    available,
    theme: off ? '' : available,
    off,
    year: Number((period?.startsOn || '').slice(0, 4)) || new Date().getFullYear(),
  };
}
