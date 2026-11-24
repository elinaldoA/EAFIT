import { t } from '../../lib/i18n';

// Frases de incentivo do assistente de voz durante a corrida. Funções puras:
// o índice faz o rodízio (sem repetir em sequência), sem depender de sorteio.
const KM_PHRASES = [
  'Mandou bem, continue assim!',
  'Ritmo firme, você está voando!',
  'Respira fundo e mantém a passada.',
  'Cada quilômetro é uma vitória. Segue!',
  'Você é mais forte do que pensa!',
  'Corpo solto, ombros relaxados. Bora!',
  'Isso aí, constância é tudo!',
  'Orgulho de você. Vai com tudo!',
];

const TIME_PHRASES = [
  'Você está indo muito bem. Continue!',
  'Segura o ritmo, você consegue!',
  'Foco na respiração. Está ótimo!',
  'Não pare agora, está quase lá!',
  'Só mais um pouquinho. Bora!',
];

// Marcos de quilômetro com mensagem própria.
const MILESTONES = {
  1: 'Primeiro quilômetro no bolso. Ótimo começo!',
  5: 'Cinco quilômetros! Que ritmo incrível!',
  10: 'Dez quilômetros! Você é uma máquina!',
  21: 'Meia maratona! Isso é lendário!',
  42: 'Maratona completa! Inacreditável!',
};

export const START_PHRASE = 'Vamos lá! Comece devagar e encontre o seu ritmo.';
export const TIME_INTERVAL_S = 240; // incentivo a cada 4 min sem aviso de km

export function kmMotivation(km) {
  if (MILESTONES[km]) return t(MILESTONES[km]);
  return t(KM_PHRASES[(km - 1) % KM_PHRASES.length]);
}

export function timeMotivation(n) {
  return t(TIME_PHRASES[n % TIME_PHRASES.length]);
}

export function startMotivation() {
  return t(START_PHRASE);
}
