// Monta o HTML e o texto puro dos e-mails do EAFIT, em pt e en. Separado do
// envio (email.ts) pra ser testável sem rede.
//
// É a única fonte do visual: os modelos de e-mail do login (redefinição de
// senha, confirmação, troca de e-mail), que são colados no dashboard do
// Supabase, são gerados daqui por supabase/templates/build.ts.
import type { Lang } from './lang.ts';

export const APP_URL = 'https://eafit.com.br/app/';
const SITE_URL = 'https://eafit.com.br/';
const LOGO_URL = 'https://eafit.com.br/app/icon-192.png';
const CONTACT_EMAIL = 'contato.eafit@gmail.com';

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

export type EmailContent = {
  subject: string;
  // Resumo que o cliente de e-mail mostra ao lado do assunto, na lista.
  preheader?: string;
  // Rótulo curto acima do título (ex.: "Segurança da conta").
  eyebrow?: string;
  heading: string;
  paragraphs: string[];
  // Opções de resposta em um toque, uma por linha, entre o texto e o botão
  // (ex.: os motivos da pesquisa de inatividade).
  choices?: { label: string; url: string }[];
  cta?: { label: string; url: string };
  // Linha miúda no fim do cartão (ex.: "se não foi você, ignore este e-mail").
  footnote?: string;
  // Troca a frase do rodapé "você recebe este e-mail porque tem uma conta".
  reason?: string;
  // Link de descadastro no rodapé: obrigatório nos e-mails que não são de
  // conta/segurança (resumo, volta, comunicado). Ver emailPrefs.ts.
  unsubscribeUrl?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STRINGS = {
  pt: {
    tagline: 'Seu treino, do seu jeito',
    fallback: 'Se o botão não funcionar, copie e cole este endereço no navegador:',
    reason: 'Você está recebendo este e-mail porque tem uma conta no EAFIT.',
    openApp: 'Abrir o app',
    terms: 'Termos de Uso',
    privacy: 'Privacidade',
    help: 'Precisa de ajuda? Escreva para',
    unsubscribe: 'Parar de receber estes e-mails',
  },
  en: {
    tagline: 'Your training, your way',
    fallback: 'If the button does not work, copy and paste this address into your browser:',
    reason: 'You are receiving this email because you have an EAFIT account.',
    openApp: 'Open the app',
    terms: 'Terms of Use',
    privacy: 'Privacy',
    help: 'Need help? Write to',
    unsubscribe: 'Stop receiving these emails',
  },
};

export function renderEmail(lang: Lang, content: EmailContent): RenderedEmail {
  const { subject, preheader, eyebrow, heading, paragraphs, choices, cta, footnote, unsubscribeUrl } = content;
  const s = { ...STRINGS[lang], ...(content.reason ? { reason: content.reason } : {}) };

  // Texto invisível: sem ele, a lista de e-mails mostra o começo do HTML
  // ("EAFIT Seu treino…") no lugar de um resumo.
  const hidden = preheader
    ? `<div class="preheader" style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f4f4f5;">${escapeHtml(preheader)}</div>`
    : '';
  const label = eyebrow
    ? `<p class="eyebrow" style="margin:0 0 10px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c2410c;">${escapeHtml(eyebrow)}</p>`
    : '';
  const body = paragraphs
    .map((p) => `<p class="text" style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3f3f46;">${escapeHtml(p)}</p>`)
    .join('\n');
  const options = choices?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
${choices.map((c) => `<tr><td style="padding:0 0 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="choice" style="border:1px solid #d4d4d8;border-radius:12px;"><a href="${escapeHtml(c.url)}" style="display:block;padding:13px 16px;font-family:${FONT};font-size:15px;line-height:1.35;font-weight:600;color:#18181b;text-decoration:none;">${escapeHtml(c.label)}</a></td></tr></table></td></tr>`).join('\n')}
</table>`
    : '';
  // Tabela em vez de <a> com padding: é o que o Outlook respeita.
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td align="center" bgcolor="#f97316" style="border-radius:12px;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;color:#0e0e12;text-decoration:none;border-radius:12px;">${escapeHtml(cta.label)}</a></td></tr></table>
<p class="muted" style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#71717a;">${escapeHtml(s.fallback)}</p>
<p class="linkbox" style="margin:0 0 24px;padding:12px 14px;font-size:12px;line-height:1.5;color:#52525b;background:#f4f4f5;border-radius:10px;word-break:break-all;"><a href="${escapeHtml(cta.url)}" style="color:#52525b;text-decoration:none;">${escapeHtml(cta.url)}</a></p>`
    : '';
  const note = footnote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="padding:18px 0 0;border-top:1px solid #e4e4e7;font-size:13px;line-height:1.55;color:#71717a;">${escapeHtml(footnote)}</td></tr></table>`
    : '';

  const unsubscribe = unsubscribeUrl
    ? `<br />\n<a href="${escapeHtml(unsubscribeUrl)}" style="color:#71717a;">${escapeHtml(s.unsubscribe)}</a>`
    : '';

  const html = `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'pt-br'}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .page { background: #0b0b0f !important; }
  .card { background: #16161a !important; border-color: #26262b !important; }
  .heading { color: #ececef !important; }
  .text { color: #d4d4d8 !important; }
  .eyebrow { color: #fb923c !important; }
  .muted, .rule, .footer, .footer a { color: #a1a1aa !important; }
  .rule { border-color: #26262b !important; }
  .linkbox { background: #1c1c21 !important; }
  .linkbox, .linkbox a { color: #a1a1aa !important; }
  .choice { border-color: #3f3f46 !important; }
  .choice a { color: #ececef !important; }
}
@media (max-width: 480px) {
  .pad { padding-left: 22px !important; padding-right: 22px !important; }
  .heading { font-size: 22px !important; }
}
</style>
</head>
<body class="page" style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT};-webkit-text-size-adjust:100%;">
${hidden}
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td class="pad" bgcolor="#0e0e12" style="padding:22px 32px;background:#0e0e12;border-radius:18px 18px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding:0 14px 0 0;"><a href="${SITE_URL}"><img src="${LOGO_URL}" width="48" height="48" alt="" style="display:block;border:0;border-radius:12px;" /></a></td>
<td style="font-family:${FONT};">
<div style="font-size:20px;line-height:1.2;font-weight:800;letter-spacing:.14em;color:#ffffff;">EAFIT</div>
<div style="font-size:12.5px;line-height:1.4;color:#a1a1aa;">${escapeHtml(s.tagline)}</div>
</td>
</tr></table>
</td></tr>
<tr><td bgcolor="#f97316" height="4" style="height:4px;font-size:0;line-height:0;background:#f97316;">&nbsp;</td></tr>
<tr><td class="card pad" bgcolor="#ffffff" style="padding:34px 32px 30px;background:#ffffff;border:1px solid #e4e4e7;border-top:0;border-radius:0 0 18px 18px;">
${label}
<h1 class="heading" style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:800;color:#18181b;">${escapeHtml(heading)}</h1>
${body}
${options}
${button}
${note}
</td></tr>
<tr><td class="footer pad" align="center" style="padding:24px 32px 0;font-size:12.5px;line-height:1.7;color:#71717a;">
<a href="${APP_URL}" style="color:#71717a;">${escapeHtml(s.openApp)}</a> &nbsp;·&nbsp;
<a href="${APP_URL}legal/termos.html" style="color:#71717a;">${escapeHtml(s.terms)}</a> &nbsp;·&nbsp;
<a href="${APP_URL}legal/privacidade.html" style="color:#71717a;">${escapeHtml(s.privacy)}</a><br />
${escapeHtml(s.help)} <a href="mailto:${CONTACT_EMAIL}" style="color:#71717a;">${CONTACT_EMAIL}</a><br />
${escapeHtml(s.reason)}${unsubscribe}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    heading,
    '',
    ...paragraphs,
    ...(choices?.length ? ['', ...choices.map((c) => `- ${c.label}: ${c.url}`)] : []),
    ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
    ...(footnote ? ['', footnote] : []),
    '',
    '--',
    'EAFIT',
    `${s.help} ${CONTACT_EMAIL}`,
    s.reason,
    ...(unsubscribeUrl ? [`${s.unsubscribe}: ${unsubscribeUrl}`] : []),
    APP_URL,
  ].join('\n');

  return { subject, html, text };
}
