// Regras puras da Edge Function send-run-challenge-alerts (testáveis sem rede/banco).

import type { Lang } from './lang.ts';

export type RunChallengeAlert = { kind: string; title: string; rank: number | null };

const MAX_TITLE = 80;
const MAX_BODY = 200;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Tipos que a função de banco devolve: 'new' (desafio novo) e 'pass' (passaram você).
export function isKnownAlert(kind: string): boolean {
  return kind === 'new' || kind === 'pass';
}

// A tag decide a tela que o toque abre (app-react/src/lib/pushTarget.js): aba
// Desafios do EAFIT Run. Um por desafio e dia, para o aparelho não empilhar.
export function runChallengeTag(kind: string, challenge: string, date: string): string {
  return `run-challenge-${kind}-${challenge}-${date}`;
}

export function buildRunChallengePush({ kind, title, rank }: RunChallengeAlert, lang: Lang = 'pt'): { title: string; body: string } {
  if (kind === 'pass') {
    return lang === 'en'
      ? { title: '👀 Someone passed you', body: clip(`You dropped to #${rank} in "${title}". One run and you're back on top!`, MAX_BODY) }
      : { title: '👀 Passaram você no desafio', body: clip(`Você caiu para o ${rank}º lugar em "${title}". Uma corrida e você volta!`, MAX_BODY) };
  }
  return lang === 'en'
    ? { title: clip('🏆 New challenge on EAFIT Run', MAX_TITLE), body: clip(`${title} — tap to join and start counting your runs.`, MAX_BODY) }
    : { title: clip('🏆 Novo desafio no EAFIT Run', MAX_TITLE), body: clip(`${title} — toque para entrar e começar a somar suas corridas.`, MAX_BODY) };
}
