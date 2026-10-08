// Gera os modelos de e-mail do login (recovery.html, confirmation.html,
// email_change.html) a partir do layout compartilhado, pra terem o mesmo
// visual dos e-mails enviados pelas Edge Functions. Os arquivos gerados são
// colados no dashboard do Supabase (Authentication → Emails → Templates).
//
//   deno run --allow-write=supabase/templates supabase/templates/build.ts
//
// Os textos levam marcações de template do Supabase ({{ ... }}); elas não
// podem ter aspas nem < >, que o layout escaparia.
import { type EmailContent, renderEmail } from '../functions/_shared/emailLayout.ts';
import type { Lang } from '../functions/_shared/lang.ts';

// O botão aponta pro próprio app, que troca o código pela sessão (ver
// app-react/src/lib/emailLink.js) — e não pro endereço do Supabase.
function link(type: string): string {
  return `{{ if .RedirectTo }}{{ .RedirectTo }}{{ else }}{{ .SiteURL }}{{ end }}?token_hash={{ .TokenHash }}&type=${type}`;
}

const TEMPLATES: Record<string, Record<Lang, EmailContent>> = {
  recovery: {
    pt: {
      subject: 'Redefinir sua senha do EAFIT',
      preheader: 'Use o botão para criar uma nova senha. O link vale por tempo limitado.',
      eyebrow: 'Segurança da conta',
      heading: 'Vamos criar uma nova senha',
      paragraphs: [
        'Recebemos um pedido para redefinir a senha da conta {{ .Email }} no EAFIT.',
        'Toque no botão abaixo para escolher uma nova senha. Seus treinos e seu histórico continuam salvos.',
      ],
      cta: { label: 'Criar nova senha', url: link('recovery') },
      footnote: 'Não pediu isso? Ignore este e-mail: sua senha continua a mesma. O link vale por tempo limitado e só pode ser usado uma vez.',
    },
    en: {
      subject: 'Reset your EAFIT password',
      preheader: 'Use the button to create a new password. The link is valid for a limited time.',
      eyebrow: 'Account security',
      heading: 'Let us create a new password',
      paragraphs: [
        'We received a request to reset the password for the EAFIT account {{ .Email }}.',
        'Tap the button below to choose a new password. Your workouts and history stay saved.',
      ],
      cta: { label: 'Create new password', url: link('recovery') },
      footnote: 'Did not request this? Ignore this email: your password stays the same. The link is valid for a limited time and can only be used once.',
    },
  },
  confirmation: {
    pt: {
      subject: 'Confirme seu e-mail no EAFIT',
      preheader: 'Falta só um passo para começar a treinar.',
      eyebrow: 'Boas-vindas',
      heading: 'Confirme seu e-mail',
      paragraphs: [
        'Sua conta no EAFIT está quase pronta. Confirme que o endereço {{ .Email }} é seu para começar a treinar.',
      ],
      cta: { label: 'Confirmar e-mail', url: link('signup') },
      footnote: 'Não criou uma conta no EAFIT? Ignore este e-mail e nada acontece.',
    },
    en: {
      subject: 'Confirm your email on EAFIT',
      preheader: 'Just one more step to start training.',
      eyebrow: 'Welcome',
      heading: 'Confirm your email',
      paragraphs: [
        'Your EAFIT account is almost ready. Confirm that {{ .Email }} is yours to start training.',
      ],
      cta: { label: 'Confirm email', url: link('signup') },
      footnote: 'Did not create an EAFIT account? Ignore this email and nothing happens.',
    },
  },
  email_change: {
    pt: {
      subject: 'Confirme seu novo e-mail no EAFIT',
      preheader: 'Confirme a troca do e-mail da sua conta.',
      eyebrow: 'Segurança da conta',
      heading: 'Confirme seu novo e-mail',
      paragraphs: [
        'Você pediu para trocar o e-mail da sua conta no EAFIT de {{ .Email }} para {{ .NewEmail }}.',
        'Toque no botão abaixo para confirmar a troca.',
      ],
      cta: { label: 'Confirmar novo e-mail', url: link('email_change') },
      footnote: 'Não pediu isso? Ignore este e-mail: nada muda na sua conta.',
    },
    en: {
      subject: 'Confirm your new email on EAFIT',
      preheader: 'Confirm the email change for your account.',
      eyebrow: 'Account security',
      heading: 'Confirm your new email',
      paragraphs: [
        'You asked to change the email of your EAFIT account from {{ .Email }} to {{ .NewEmail }}.',
        'Tap the button below to confirm the change.',
      ],
      cta: { label: 'Confirm new email', url: link('email_change') },
      footnote: 'Did not request this? Ignore this email: nothing changes in your account.',
    },
  },
};

// Idioma da conta (user_metadata.lang); sem valor, português. O printf evita
// erro de comparação quando o campo não existe.
const IS_EN = `eq (printf "%v" .Data.lang) "en"`;

const dir = new URL('.', import.meta.url);
const subjects: string[] = [];
for (const [name, byLang] of Object.entries(TEMPLATES)) {
  const pt = renderEmail('pt', byLang.pt);
  const en = renderEmail('en', byLang.en);
  await Deno.writeTextFile(new URL(`${name}.html`, dir), `{{ if ${IS_EN} }}${en.html}{{ else }}${pt.html}{{ end }}\n`);
  subjects.push(`${name}:\n{{ if ${IS_EN} }}${en.subject}{{ else }}${pt.subject}{{ end }}\n`);
}
// Assuntos pra colar no campo Subject de cada modelo.
await Deno.writeTextFile(new URL('subjects.txt', dir), subjects.join('\n'));
