import { useEffect, useState } from 'react';
import { useSeason } from '../hooks/useSeason';
import { halloweenWindow, setCurrentSeason } from '../lib/season';

import { t, locale } from '../lib/i18n';
const DISMISS_KEY = 'eafit_season_banner';

function wasDismissed(id) {
  try { return localStorage.getItem(DISMISS_KEY) === id; } catch { return false; }
}

// Marca o <html> com o tema de temporada (styles/season.css) e avisa o card de
// compartilhar e o treinador por voz. Fica montado o tempo todo, com ou sem login.
export function SeasonDecor() {
  const { theme } = useSeason();
  useEffect(() => {
    setCurrentSeason(theme);
    if (theme) document.documentElement.setAttribute('data-season', theme);
    else document.documentElement.removeAttribute('data-season');
    // Barra de status do celular no mesmo roxo do fundo (tokens em styles/season.css).
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta || theme !== 'halloween') return undefined;
    const before = meta.getAttribute('content');
    meta.setAttribute('content', '#120c1a');
    return () => meta.setAttribute('content', before);
  }, [theme]);
  if (theme !== 'halloween') return null;
  // Morcegos voando, aranha descendo do topo e névoa (styles/season.css).
  // Só enfeite: sem toque, escondido do leitor de tela e no modo ao vivo.
  return (
    <div className="season-fx" aria-hidden="true">
      <span className="season-bat" />
      <span className="season-bat" />
      <span className="season-bat" />
      <span className="season-spider" />
      <span className="season-fog" />
    </div>
  );
}

// Faixa da semana do Dia das Bruxas, explicando a conquista. Fechou, some até
// o próximo ano.
export default function SeasonBanner() {
  const { theme, year } = useSeason();
  const id = `${theme}-${year}`;
  // A configuração chega depois do primeiro render: confere sempre com o id atual.
  const [closedId, setClosedId] = useState('');

  if (theme !== 'halloween' || closedId === id || wasDismissed(id)) return null;

  const { day, to } = halloweenWindow(year);
  const fmt = d => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace(/\.$/, '');

  function close() {
    try { localStorage.setItem(DISMISS_KEY, id); } catch { /* armazenamento bloqueado */ }
    setClosedId(id);
  }

  return (
    <div className="season-banner" role="status">
      <span className="season-banner__emoji" aria-hidden="true">🎃</span>
      <span className="season-banner__text">
        <strong>{t('Semana do Dia das Bruxas!')}</strong>{' '}
        {t('Treine no dia {dia} ou faça 3 treinos até {fim} e ganhe a conquista Treino das Bruxas.', { dia: fmt(day), fim: fmt(to) })}
      </span>
      <button type="button" className="season-banner__close" onClick={close} aria-label={t('Fechar aviso')}>×</button>
    </div>
  );
}
