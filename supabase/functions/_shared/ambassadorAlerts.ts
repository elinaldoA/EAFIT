// Regras puras da Edge Function send-ambassador-alerts (testáveis sem rede/banco).

import type { Lang } from './lang.ts';

export type SignupAlert = { fresh: number; total: number };

// Só o influenciador recebe o aviso; o embaixador fica como antes.
export function alertsKind(kind: string): boolean {
  return kind === 'influenciador';
}

// A tag decide a tela que o toque abre (app-react/src/lib/pushTarget.js): o
// modo Influenciador, aba Resultados.
export function signupTag(date: string, hour: number): string {
  return `influencer-signups-${date}-${hour}`;
}

// Metas do influenciador — mesma lista de app-react/src/lib/influencerGoals.js.
export const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

// Maior marco que os cadastros novos fizeram passar (ou null).
export function crossedMilestone(fresh: number, total: number): number | null {
  const before = total - fresh;
  const hit = MILESTONES.filter((m) => before < m && total >= m);
  return hit.length ? hit[hit.length - 1] : null;
}

// Só números: o painel nunca diz quem se cadastrou, o aviso também não. Se a
// rodada bateu uma meta, o título comemora a meta.
export function buildSignupPush({ fresh, total }: SignupAlert, lang: Lang = 'pt'): { title: string; body: string } {
  const goal = crossedMilestone(fresh, total);
  if (goal !== null) {
    if (lang === 'en') {
      return {
        title: goal === 1 ? '🏆 Your first sign-up!' : `🏆 Goal reached: ${goal} sign-ups!`,
        body: `${fresh === 1 ? '1 new sign-up' : `${fresh} new sign-ups`} from your link, ${total} in total. See your badges in Influencer mode.`,
      };
    }
    return {
      title: goal === 1 ? '🏆 Seu primeiro cadastro!' : `🏆 Meta batida: ${goal} cadastros!`,
      body: `${fresh === 1 ? '1 conta nova' : `${fresh} contas novas`} pelo seu link, ${total} no total. Veja seus selos no modo Influenciador.`,
    };
  }
  if (lang === 'en') {
    return {
      title: fresh === 1 ? '🎉 New sign-up from your link' : `🎉 ${fresh} new sign-ups from your link`,
      body: `That's ${total} in total. See the numbers in Influencer mode.`,
    };
  }
  return {
    title: fresh === 1 ? '🎉 Nova conta pelo seu link' : `🎉 ${fresh} novas contas pelo seu link`,
    body: `Já são ${total} no total. Veja os números no modo Influenciador.`,
  };
}
