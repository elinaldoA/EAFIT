// Central de avisos do app (public.user_notifications): grava o que foi
// enviado por push para o aluno poder reler dentro do app. Melhor esforço —
// falha aqui nunca derruba o envio do push.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// campaign: id do envio manual/agendado, para medir o efeito no painel
// (admin_campaign_effect). As automáticas não têm.
export type InboxItem = { kind: string; title: string; body: string; campaign?: string };

const CHUNK = 500;

// Cópia no app de um e-mail: o título é o assunto e o texto, os parágrafos
// (o resumo do e-mail, sem botão nem rodapé). `kind` define pra que tela o
// aviso leva (app-react/src/lib/pushTarget.js).
export function inboxFromEmail(kind: string, content: { subject: string; paragraphs: string[] }): InboxItem {
  return { kind, title: content.subject, body: content.paragraphs.join(' ').slice(0, 400) };
}

// Todos os usuários (para envio "para todos"), paginando o GoTrue.
export async function listAllUserIds(admin: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error('inbox listUsers error:', error.message);
      break;
    }
    for (const u of data.users) ids.push(u.id);
    if (data.users.length < 1000) break;
  }
  return ids;
}

// item pode ser uma função (texto por pessoa, com variáveis: _shared/broadcastVars.ts).
export async function saveInbox(admin: SupabaseClient, userIds: string[], item: InboxItem | ((userId: string) => InboxItem)): Promise<void> {
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const rows = userIds.slice(i, i + CHUNK).map((user_id) => ({ user_id, ...(typeof item === 'function' ? item(user_id) : item) }));
    const { error } = await admin.from('user_notifications').insert(rows);
    if (error) console.error('inbox insert error:', error.message);
  }
}
