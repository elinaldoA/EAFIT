import { useEffect, useState } from 'react';
import { useSeason } from '../hooks/useSeason';
import { useAppConfig } from '../context/useAppConfig';
import { SEASONS, applySeason, cacheSeason, seasonWindow } from '../lib/season';
import { challengeVars } from '../lib/seasonLabels';

import { t } from '../lib/i18n';
const DISMISS_KEY = 'eafit_season_banner';

function wasDismissed(id) {
  try { return localStorage.getItem(DISMISS_KEY) === id; } catch { return false; }
}

const FALLING = new Set(['natal', 'carnaval']);

// Aplica o tema de temporada no documento (lib/season.js: <html data-season>,
// barra de status, favicon e o que card de compartilhar, treinador por voz e
// textos leem) e guarda a configuração pro próximo boot. Fica montado o tempo
// todo, com ou sem login.
export function SeasonDecor() {
  const { theme } = useSeason();
  const { config, loaded } = useAppConfig();
  useEffect(() => { applySeason(theme); }, [theme]);
  useEffect(() => { if (loaded) cacheSeason(config.season); }, [loaded, config.season]);
  if (!theme) return null;
  if (theme !== 'halloween') {
    // Partículas do tema subindo devagar, ou caindo (neve, confete), bem
    // discretas (styles/season.css).
    return (
      <div className={`season-fx${FALLING.has(theme) ? ' season-fx--fall' : ''}`} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="season-bubble" />)}
      </div>
    );
  }
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

// Título e texto da faixa de cada tema, explicando a conquista (variáveis em
// challengeVars).
const BANNER_TEXT = {
  carnaval: v => [t('Carnaval!'), t('Bloco na rua e treino em dia: faça {meta} treinos entre {de} e {ate} e ganhe a conquista Carnaval.', v)],
  pascoa: v => [t('Páscoa!'), t('Hora de queimar o chocolate: faça {meta} treinos entre {de} e {ate} e ganhe a conquista Páscoa.', v)],
  namorados: v => [t('Semana dos Namorados!'), t('Chame seu amor pra treinar: treine no dia {dia} ou faça {meta} treinos até {fim} e ganhe a conquista Namorados.', v)],
  festa_junina: v => [t('Arraiá do EAFIT!'), t('Faça {meta} treinos entre {de} e {ate} e ganhe a conquista Arraiá. Anarriê!', v)],
  outubro_rosa: v => [
    t('Outubro Rosa!'),
    t('Mês de conscientização sobre o câncer de mama: cuide de você, com treino e exames em dia. Faça {meta} treinos até {fim} e ganhe a conquista Outubro Rosa.', v),
  ],
  halloween: v => [t('Semana do Dia das Bruxas!'), t('Treine no dia {dia} ou faça 3 treinos até {fim} e ganhe a conquista Treino das Bruxas.', v)],
  novembro_azul: v => [
    t('Novembro Azul!'),
    t('Mês de cuidar da saúde do homem: treino em dia e exames de rotina também. Faça {meta} treinos até {fim} e ganhe a conquista Novembro Azul.', v),
  ],
  natal: v => [t('Natal no EAFIT!'), t('Treine no dia {dia} ou faça {meta} treinos entre {de} e {ate} e ganhe a conquista Treino de Natal.', v)],
  ano_novo: v => [t('Feliz Ano Novo!'), t('Comece {ano} treinando: faça um treino entre {de} e {ate} e ganhe a conquista Ano Novo {ano}.', v)],
};

// Faixa do tema de temporada, explicando a conquista. Fechou, some até o
// próximo ano.
export default function SeasonBanner() {
  const { theme, year } = useSeason();
  const id = `${theme}-${year}`;
  // A configuração chega depois do primeiro render: confere sempre com o id atual.
  const [closedId, setClosedId] = useState('');

  if (!BANNER_TEXT[theme] || closedId === id || wasDismissed(id)) return null;

  const [title, text] = BANNER_TEXT[theme](challengeVars(seasonWindow(theme, year)));

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
