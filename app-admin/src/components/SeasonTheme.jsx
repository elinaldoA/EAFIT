import { useEffect } from 'react';
import { SEASON_CHANGE_EVENT, applyAdminSeason, fetchSeason, isAdminSeasonOff, liveTheme } from '../lib/season';

// Busca o tema de temporada no boot (leitura pública, vale também no login) e
// de novo quando o admin salva a agenda ou liga/desliga o tema no navegador.
// Sem rede ou sem tema, o painel fica com as cores de sempre.
export default function SeasonTheme() {
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const season = await fetchSeason();
        if (alive) applyAdminSeason(isAdminSeasonOff() ? '' : liveTheme(season));
      } catch { /* fica sem tema */ }
    }
    load();
    window.addEventListener(SEASON_CHANGE_EVENT, load);
    return () => { alive = false; window.removeEventListener(SEASON_CHANGE_EVENT, load); };
  }, []);
  return null;
}
