// Destinatários dos e-mails em lote (resumo semanal, comunicados): lê as
// contas do GoTrue e monta cada mensagem já com o link de descadastro da
// pessoa. Quem pode receber é decidido em weeklyEmails.ts.
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import type { SendOptions } from './email.ts';
import { type EmailContent, type RenderedEmail, renderEmail } from './emailLayout.ts';
import { unsubscribeLinks, unsubscribeToken } from './emailPrefs.ts';
import { type Lang, langOf } from './lang.ts';
import type { EmailUser } from './weeklyEmails.ts';

function toEmailUser(u: User): EmailUser {
  return {
    id: u.id,
    email: u.email || null,
    confirmed: !!u.email_confirmed_at,
    bannedUntil: (u as { banned_until?: string | null }).banned_until || null,
    createdAt: u.created_at,
    meta: (u.user_metadata || {}) as Record<string, unknown>,
  };
}

// Com `ids`, só essas contas (uma consulta por conta, em paralelo; lista
// grande pagina tudo de uma vez pra não bater no limite do GoTrue). Sem
// `ids`, todas.
export async function loadEmailUsers(admin: SupabaseClient, ids?: string[]): Promise<EmailUser[]> {
  const wanted = ids ? new Set(ids) : null;
  const out: EmailUser[] = [];

  if (wanted && wanted.size <= 100) {
    await Promise.all([...wanted].map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error) console.error('loadEmailUsers getUserById error:', error.message);
      else if (data.user) out.push(toEmailUser(data.user));
    }));
    return out;
  }

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error('loadEmailUsers listUsers error:', error.message);
      break;
    }
    for (const u of data.users) if (!wanted || wanted.has(u.id)) out.push(toEmailUser(u));
    if (data.users.length < 1000) break;
  }
  return out;
}

export type BulkEmailItem = { to: string; email: RenderedEmail; options: SendOptions };

// Mensagem no idioma da conta, com descadastro no rodapé e no cabeçalho.
export async function bulkEmailItem(
  user: EmailUser,
  build: (lang: Lang) => EmailContent,
  env: { supabaseUrl: string; secret: string },
): Promise<BulkEmailItem> {
  const lang = langOf(user.meta);
  const links = unsubscribeLinks(await unsubscribeToken(user.id, env.secret), env.supabaseUrl);
  return {
    to: user.email!,
    email: renderEmail(lang, { ...build(lang), unsubscribeUrl: links.page }),
    options: { listUnsubscribe: links.oneClick },
  };
}
