// Envio de e-mail pelas Edge Functions, usando a conta Gmail do projeto
// (SMTP do Gmail com senha de app). Os e-mails do login (redefinição de
// senha, confirmação) não passam por aqui: quem envia é o próprio Supabase
// Auth, com o mesmo SMTP configurado no dashboard.
//
// Secrets das Edge Functions:
//   GMAIL_USER          endereço da conta (ex.: contato.eafit@gmail.com)
//   GMAIL_APP_PASSWORD  senha de app de 16 letras (conta Google → Segurança →
//                       Senhas de app; exige verificação em duas etapas)
//
// O Gmail limita a ~500 destinatários por dia e sempre envia com o próprio
// endereço da conta como remetente.
import nodemailer from 'npm:nodemailer@6.9.16';
import type { RenderedEmail } from './emailLayout.ts';

const FROM_NAME = 'EAFIT';

type Transport = { sendMail: (message: Record<string, unknown>) => Promise<unknown> };
let transport: Transport | null = null;

function getTransport(user: string, pass: string): Transport {
  // Porta 465 (TLS direto): as Edge Functions bloqueiam saída nas portas 25 e 587.
  transport ??= nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  }) as Transport;
  return transport;
}

export type SendOptions = {
  // Endereço de descadastro em um clique (cabeçalho List-Unsubscribe): o Gmail
  // mostra um botão "Cancelar inscrição" ao lado do remetente.
  listUnsubscribe?: string;
};

// Retorna 'sent', 'skipped' (secrets não configurados — o chamador segue sem
// e-mail) ou 'error' (falha no envio, só loga).
export async function sendEmail(to: string, email: RenderedEmail, options: SendOptions = {}): Promise<'sent' | 'skipped' | 'error'> {
  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) return 'skipped';
  try {
    await getTransport(user, pass).sendMail({
      from: { name: FROM_NAME, address: user },
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: options.listUnsubscribe
        ? { 'List-Unsubscribe': `<${options.listUnsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
        : undefined,
    });
    return 'sent';
  } catch (err) {
    console.error('sendEmail error:', err);
    return 'error';
  }
}

// Envio em lote, poucos por vez: o Gmail derruba quem abre muitas conexões ou
// dispara rápido demais. Devolve quantos saíram.
export async function sendEmailBatch(
  items: { to: string; email: RenderedEmail; options?: SendOptions }[],
  concurrency = 3,
): Promise<number> {
  let sent = 0;
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      if ((await sendEmail(item.to, item.email, item.options)) === 'sent') sent++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return sent;
}
