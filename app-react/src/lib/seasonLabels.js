import { t, locale } from './i18n';

// Título do card de decoração no Perfil e rótulo da opção, por tema
// (lib/season.js). Funções: t() lê o idioma na hora.
export const SEASON_DECOR_TITLE = {
  outubro_rosa: () => t('Decoração do Outubro Rosa'),
  halloween: () => t('Decoração do Dia das Bruxas'),
  novembro_azul: () => t('Decoração do Novembro Azul'),
};

export const SEASON_DECOR_LABEL = {
  outubro_rosa: () => t('Mostrar a decoração do Outubro Rosa'),
  halloween: () => t('Mostrar a decoração do Dia das Bruxas'),
  novembro_azul: () => t('Mostrar a decoração do Novembro Azul'),
};

// "24 de out" / "Oct 24": data curta das faixas e conquistas de temporada.
export function seasonDay(d) {
  return new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace(/\.$/, '');
}
