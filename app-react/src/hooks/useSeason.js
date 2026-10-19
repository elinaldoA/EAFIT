import { useEffect, useState } from 'react';
import { useAppConfig } from '../context/useAppConfig';
import { activeSeason, isSeasonOff, onSeasonChange } from '../lib/season';

// Tema de temporada no ar (lib/season.js). `available` é o tema do período,
// mesmo que a pessoa tenha desligado; `theme` é o que deve aparecer.
export function useSeason() {
  const { config } = useAppConfig();
  const [, setTick] = useState(0);
  useEffect(() => onSeasonChange(() => setTick(n => n + 1)), []);

  const available = activeSeason(config.season);
  const off = available ? isSeasonOff(available) : false;
  return {
    available,
    theme: off ? '' : available,
    off,
    year: Number((config.season?.startsOn || '').slice(0, 4)) || new Date().getFullYear(),
  };
}
