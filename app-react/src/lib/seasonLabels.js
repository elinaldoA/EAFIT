import { t, locale } from './i18n';

// Título do card de decoração no Perfil e rótulo da opção, por tema
// (lib/season.js). Funções: t() lê o idioma na hora.
export const SEASON_DECOR_TITLE = {
  carnaval: () => t('Decoração de Carnaval'),
  pascoa: () => t('Decoração de Páscoa'),
  namorados: () => t('Decoração dos Namorados'),
  festa_junina: () => t('Decoração da Festa Junina'),
  outubro_rosa: () => t('Decoração do Outubro Rosa'),
  halloween: () => t('Decoração do Dia das Bruxas'),
  novembro_azul: () => t('Decoração do Novembro Azul'),
  natal: () => t('Decoração de Natal'),
  ano_novo: () => t('Decoração de Ano Novo'),
};

export const SEASON_DECOR_LABEL = {
  carnaval: () => t('Mostrar a decoração de Carnaval'),
  pascoa: () => t('Mostrar a decoração de Páscoa'),
  namorados: () => t('Mostrar a decoração dos Namorados'),
  festa_junina: () => t('Mostrar a decoração da Festa Junina'),
  outubro_rosa: () => t('Mostrar a decoração do Outubro Rosa'),
  halloween: () => t('Mostrar a decoração do Dia das Bruxas'),
  novembro_azul: () => t('Mostrar a decoração do Novembro Azul'),
  natal: () => t('Mostrar a decoração de Natal'),
  ano_novo: () => t('Mostrar a decoração de Ano Novo'),
};

// "24 de out" / "Oct 24": data curta das faixas e conquistas de temporada.
export function seasonDay(d) {
  return new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace(/\.$/, '');
}

// Variáveis dos textos de faixa e conquista de um desafio (lib/season.js):
// {meta} treinos, {de}/{ate} (= {fim}) da janela, {dia} que basta, {ano}.
export function challengeVars(w) {
  return { meta: w.goal, de: seasonDay(w.from), ate: seasonDay(w.to), fim: seasonDay(w.to), dia: w.day ? seasonDay(w.day) : '', ano: Number(w.to.slice(0, 4)) };
}
