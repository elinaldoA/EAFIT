import { useEffect, useState } from 'react';
import { useSeason } from '../hooks/useSeason';
import { useAppConfig } from '../context/useAppConfig';
import { SEASONS, applySeason, cacheSeason, halloweenWindow, novembroAzulWindow, outubroRosaWindow } from '../lib/season';
import { seasonDay as fmt } from '../lib/seasonLabels';

import { t } from '../lib/i18n';
const DISMISS_KEY = 'eafit_season_banner';

function wasDismissed(id) {
  try { return localStorage.getItem(DISMISS_KEY) === id; } catch { return false; }
}

// Aplica o tema de temporada no documento (lib/season.js: <html data-season>,
// barra de status, favicon e o que card de compartilhar, treinador por voz e
// textos leem) e guarda a configuração pro próximo boot. Fica montado o tempo
// todo, com ou sem login.
export function SeasonDecor() {
  const { theme } = useSeason();
  const { config, loaded } = useAppConfig();
  useEffect(() => { applySeason(theme); }, [theme]);
  useEffect(() => { if (loaded) cacheSeason(config.season); }, [loaded, config.season]);
  if (theme === 'outubro_rosa' || theme === 'novembro_azul') {
    // Bolhas na cor do laço subindo devagar (styles/season.css): discreto, é
    // campanha de saúde.
    return (
      <div className="season-fx" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="season-bubble" />)}
      </div>
    );
  }
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

// Texto da faixa de cada tema, explicando a conquista.
const BANNER_TEXT = {
  outubro_rosa: year => {
    const { goal, to } = outubroRosaWindow(year);
    return [
      t('Outubro Rosa!'),
      t('Mês de conscientização sobre o câncer de mama: cuide de você, com treino e exames em dia. Faça {meta} treinos até {fim} e ganhe a conquista Outubro Rosa.', { meta: goal, fim: fmt(to) }),
    ];
  },
  halloween: year => {
    const { day, to } = halloweenWindow(year);
    return [t('Semana do Dia das Bruxas!'), t('Treine no dia {dia} ou faça 3 treinos até {fim} e ganhe a conquista Treino das Bruxas.', { dia: fmt(day), fim: fmt(to) })];
  },
  novembro_azul: year => {
    const { goal, to } = novembroAzulWindow(year);
    return [
      t('Novembro Azul!'),
      t('Mês de cuidar da saúde do homem: treino em dia e exames de rotina também. Faça {meta} treinos até {fim} e ganhe a conquista Novembro Azul.', { meta: goal, fim: fmt(to) }),
    ];
  },
};

// Faixa do tema de temporada, explicando a conquista. Fechou, some até o
// próximo ano.
export default function SeasonBanner() {
  const { theme, year } = useSeason();
  const id = `${theme}-${year}`;
  // A configuração chega depois do primeiro render: confere sempre com o id atual.
  const [closedId, setClosedId] = useState('');

  if (!BANNER_TEXT[theme] || closedId === id || wasDismissed(id)) return null;

  const [title, text] = BANNER_TEXT[theme](year);

  function close() {
    try { localStorage.setItem(DISMISS_KEY, id); } catch { /* armazenamento bloqueado */ }
    setClosedId(id);
  }

  return (
    <div className="season-banner" role="status">
      <span className="season-banner__emoji" aria-hidden="true">{SEASONS[theme].emoji}</span>
      <span className="season-banner__text">
        <strong>{title}</strong>{' '}
        {text}
      </span>
      <button type="button" className="season-banner__close" onClick={close} aria-label={t('Fechar aviso')}>×</button>
    </div>
  );
}
