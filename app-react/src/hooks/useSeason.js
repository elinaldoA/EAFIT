import { useEffect, useState } from 'react';
import { useAppConfig } from '../context/useAppConfig';
import { activeSeason, cachedSeason, isSeasonOff, onSeasonChange } from '../lib/season';

// Tema de temporada no ar (lib/season.js). `available` é o tema do período,
// mesmo que a pessoa tenha desligado; `theme` é o que deve aparecer. Até a
// configuração chegar, vale a última guardada no aparelho.
export function useSeason() {
  const { config, loaded } = useAppConfig();
  const [, setTick] = useState(0);
  useEffect(() => onSeasonChange(() => setTick(n => n + 1)), []);

  const season = loaded ? config.season : cachedSeason();
  const available = activeSeason(season);
  const off = available ? isSeasonOff(available) : false;
  return {
    available,
    theme: off ? '' : available,
    off,
    year: Number((season?.startsOn || '').slice(0, 4)) || new Date().getFullYear(),
  };
}
