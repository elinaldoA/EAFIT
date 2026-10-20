import { t } from './i18n';

// Embaixador e influenciador têm o mesmo modo no app (app-react/src/program/);
// só os nomes mudam. kind = ambassadors.kind ('embaixador' | 'influenciador').
export const PROGRAM_KINDS = ['embaixador', 'influenciador'];

export function programLabels(kind) {
  if (kind === 'influenciador') {
    return {
      role: t('Influenciador'),
      button: t('📣 Influenciador'),
      mode: t('📣 Modo Influenciador'),
      openMode: t('Abrir modo Influenciador'),
      group: t('Influenciador EAFIT'),
      nav: t('Navegação do influenciador'),
      backHint: t('Quer treinar também? Troque para o modo aluno para usar o app de treino normal. Você volta ao modo Influenciador pelo botão no topo.'),
      rankingTitle: t('🏁 Ranking dos influenciadores'),
      rankingPos: (pos, total) => t('Você está em {pos}º lugar entre {total} influenciadores.', { pos, total }),
      anonymous: t('Influenciador anônimo'),
      rankingHint: t('Desligado, os outros influenciadores veem você como anônimo. Seus números continuam contando.'),
      tutorialRole: 'influencer',
    };
  }
  return {
    role: t('Embaixador'),
    button: t('📣 Embaixador'),
    mode: t('📣 Modo Embaixador'),
    openMode: t('Abrir modo Embaixador'),
    group: t('Embaixador EAFIT'),
    nav: t('Navegação do embaixador'),
    backHint: t('Quer treinar também? Troque para o modo aluno para usar o app de treino normal. Você volta ao modo Embaixador pelo botão no topo.'),
    rankingTitle: t('🏁 Ranking dos embaixadores'),
    rankingPos: (pos, total) => t('Você está em {pos}º lugar entre {total} embaixadores.', { pos, total }),
    anonymous: t('Embaixador anônimo'),
    rankingHint: t('Desligado, os outros embaixadores veem você como anônimo. Seus números continuam contando.'),
    tutorialRole: 'ambassador',
  };
}
