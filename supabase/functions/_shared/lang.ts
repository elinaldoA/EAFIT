// Idioma do usuário nas notificações do servidor. O app grava o idioma
// escolhido em user_metadata.lang ('pt' | 'en'); sem valor (conta antiga que
// ainda não abriu o app depois dessa mudança), vale português.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { exerciseNames, focoNames, focoParts } from './exerciseI18n.ts';

export type Lang = 'pt' | 'en';

export function langOf(meta: unknown): Lang {
  const v = (meta as { lang?: unknown } | null | undefined)?.lang;
  return v === 'en' ? 'en' : 'pt';
}

export function localeOf(lang: Lang): string {
  return lang === 'en' ? 'en-US' : 'pt-BR';
}

// Idioma de vários usuários de uma vez. Poucos ids: uma consulta por usuário
// em paralelo; muitos: pagina o GoTrue uma vez só (evita rate limit).
export async function loadLangs(admin: SupabaseClient, ids: string[]): Promise<Map<string, Lang>> {
  const out = new Map<string, Lang>();
  const wanted = new Set(ids);
  if (!wanted.size) return out;

  if (wanted.size <= 100) {
    await Promise.all([...wanted].map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error) console.error('loadLangs getUserById error:', error.message);
      else out.set(id, langOf(data.user?.user_metadata));
    }));
    return out;
  }

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error('loadLangs listUsers error:', error.message);
      break;
    }
    for (const u of data.users) if (wanted.has(u.id)) out.set(u.id, langOf(u.user_metadata));
    if (data.users.length < 1000) break;
  }
  return out;
}

// Prefixo de emoji ("🔷 Prancha") é preservado na tradução.
const EMOJI_PREFIX = /^[\p{Extended_Pictographic}️‍]+\s*/u;

export function trExercise(lang: Lang, nome: string): string {
  if (lang !== 'en' || !nome) return nome;
  const prefix = nome.match(EMOJI_PREFIX)?.[0] ?? '';
  const hit = exerciseNames[nome.slice(prefix.length)];
  return hit ? prefix + hit : nome;
}

export function trFoco(lang: Lang, foco: string): string {
  if (lang !== 'en' || !foco) return foco;
  if (focoNames[foco]) return focoNames[foco];
  return foco.split(' / ').map((p) => focoParts[p] ?? p).join(' / ');
}

// Variáveis que o banco devolve já em português ("hoje", "em 2 dias").
export function trQuando(lang: Lang, quando: string): string {
  if (lang !== 'en') return quando;
  if (quando === 'hoje') return 'today';
  if (quando === 'amanhã') return 'tomorrow';
  const m = quando.match(/^em (\d+) dias?$/);
  if (m) return `in ${m[1]} ${m[1] === '1' ? 'day' : 'days'}`;
  return quando;
}

export function trVars(
  lang: Lang,
  vars: Record<string, string | number | null | undefined>,
): Record<string, string | number | null | undefined> {
  if (lang !== 'en') return vars;
  const out = { ...vars };
  if (typeof out.quando === 'string') out.quando = trQuando(lang, out.quando);
  if (typeof out.foco === 'string') out.foco = trFoco(lang, out.foco);
  return out;
}
