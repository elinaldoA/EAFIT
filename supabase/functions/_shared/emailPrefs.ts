// Preferência de e-mail e link de descadastro. Só os e-mails de resumo,
// reengajamento e comunicados respeitam a preferência (user_metadata
// notifyEmail, ligada por padrão); os de conta e segurança saem sempre.
//
// O link de descadastro funciona sem login: carrega o id do usuário assinado
// (HMAC-SHA256), então ninguém consegue descadastrar outra pessoa adivinhando
// o endereço. A chave da assinatura é a service role, que só as Edge
// Functions conhecem.
import { APP_URL } from './emailLayout.ts';

export function emailOptedIn(meta: unknown): boolean {
  return (meta as { notifyEmail?: unknown } | null | undefined)?.notifyEmail !== false;
}

async function sign(userId: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`email-unsubscribe:${userId}`)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function unsubscribeToken(userId: string, secret: string): Promise<string> {
  return `${userId}.${await sign(userId, secret)}`;
}

// Devolve o id do usuário se o código for válido; senão, null.
export async function verifyUnsubscribeToken(token: unknown, secret: string): Promise<string | null> {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = await sign(userId, secret);
  if (given.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? userId : null;
}

// `page` vai no rodapé do e-mail (abre o app, que confirma o descadastro);
// `oneClick` vai no cabeçalho List-Unsubscribe, pro botão de descadastro do
// próprio cliente de e-mail.
export function unsubscribeLinks(token: string, supabaseUrl: string): { page: string; oneClick: string } {
  const t = encodeURIComponent(token);
  return {
    page: `${APP_URL}?descadastro=${t}`,
    oneClick: `${supabaseUrl}/functions/v1/email-unsubscribe?t=${t}`,
  };
}
