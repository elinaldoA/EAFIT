// Marca os links do app nos e-mails com a origem e o tipo de e-mail. O app e o
// site já gravam ?origem= e ?utm_campaign= nas visitas (page_visits), então o
// clique no e-mail aparece sozinho em "Campanha × criativo" e na origem
// "email" — o Gmail SMTP não devolve abertura nem clique.
import { APP_URL } from './emailLayout.ts';

const KIND_RE = /^[a-z0-9-]{3,40}$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Só o endereço do app puro (com ou sem #âncora): páginas legais, o link de
// descadastro (?descadastro=) e o texto visível do link ficam como estão.
// No HTML só o href é marcado, pra o endereço mostrado na mensagem ficar limpo.
export function tagAppLinks(content: string, kind: string, format: 'html' | 'text'): string {
  if (!KIND_RE.test(kind)) return content;
  const url = escapeRegExp(APP_URL);
  const amp = format === 'html' ? '&amp;' : '&';
  const query = `?origem=email${amp}utm_campaign=${kind}`;
  return format === 'html'
    ? content.replace(new RegExp(`(href=")${url}(?=[#"])`, 'g'), `$1${APP_URL}${query}`)
    : content.replace(new RegExp(`${url}(?=#|\\s|$)`, 'g'), `${APP_URL}${query}`);
}
