// Regras puras da Edge Function send-ambassador-alerts (testáveis sem rede/banco).

import type { Lang } from './lang.ts';

export type SignupAlert = { kind: string; fresh: number; total: number };

// Embaixador e influenciador recebem o aviso (cada um no próprio modo do app).
export function alertsKind(kind: string): boolean {
  return kind === 'influenciador' || kind === 'embaixador';
}

// A tag decide a tela que o toque abre (app-react/src/lib/pushTarget.js): o
// modo do programa (Embaixador ou Influenciador), aba Resultados.
export function signupTag(date: string, hour: number): string {
  return `program-signups-${date}-${hour}`;
}

// Metas — mesma lista de app-react/src/lib/programGoals.js.
export const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

// Maior marco que os cadastros novos fizeram passar (ou null).
export function crossedMilestone(fresh: number, total: number): number | null {
  const before = total - fresh;
  const hit = MILESTONES.filter((m) => before < m && total >= m);
  return hit.length ? hit[hit.length - 1] : null;
}

function modeName(kind: string, lang: Lang): string {
  const infl = kind === 'influenciador';
  if (lang === 'en') return infl ? 'Influencer mode' : 'Ambassador mode';
  return infl ? 'modo Influenciador' : 'modo Embaixador';
}

// Só números: o painel nunca diz quem se cadastrou, o aviso também não. Se a
// rodada bateu uma meta, o título comemora a meta.
export function buildSignupPush({ kind, fresh, total }: SignupAlert, lang: Lang = 'pt'): { title: string; body: string } {
  const mode = modeName(kind, lang);
  const goal = crossedMilestone(fresh, total);
  if (goal !== null) {
    if (lang === 'en') {
      return {
        title: goal === 1 ? '🏆 Your first sign-up!' : `🏆 Goal reached: ${goal} sign-ups!`,
        body: `${fresh === 1 ? '1 new sign-up' : `${fresh} new sign-ups`} from your link, ${total} in total. See your badges in ${mode}.`,
      };
    }
    return {
      title: goal === 1 ? '🏆 Seu primeiro cadastro!' : `🏆 Meta batida: ${goal} cadastros!`,
      body: `${fresh === 1 ? '1 conta nova' : `${fresh} contas novas`} pelo seu link, ${total} no total. Veja seus selos no ${mode}.`,
    };
  }
  if (lang === 'en') {
    return {
      title: fresh === 1 ? '🎉 New sign-up from your link' : `🎉 ${fresh} new sign-ups from your link`,
      body: `That's ${total} in total. See the numbers in ${mode}.`,
    };
  }
  return {
    title: fresh === 1 ? '🎉 Nova conta pelo seu link' : `🎉 ${fresh} novas contas pelo seu link`,
    body: `Já são ${total} no total. Veja os números no ${mode}.`,
  };
}
