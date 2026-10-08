// Textos dos e-mails enviados pelas Edge Functions (boas-vindas, conta
// excluída), em pt e en. Separado das funções pra ser testável sem rede; o
// visual vem de emailLayout.ts. Os e-mails do login (redefinição de senha,
// confirmação, avisos de segurança) ficam em supabase/templates/build.ts.
import { APP_URL, type EmailContent } from './emailLayout.ts';
import type { Lang } from './lang.ts';

export function welcomeEmail(lang: Lang): EmailContent {
  return lang === 'en'
    ? {
      subject: 'Welcome to EAFIT',
      preheader: 'Your account is ready. Here is how to get started.',
      eyebrow: 'Welcome',
      heading: 'Your account is ready',
      paragraphs: [
        'Great to have you here. With EAFIT you get a personalized training plan, log your loads and records, track your hydration and follow your progress.',
        'To keep the app at hand, open eafit.com.br/app on your phone and choose Install (or Add to Home Screen). Once installed, it works even without internet.',
      ],
      cta: { label: 'Open the app', url: APP_URL },
      footnote: 'Tip: turn on notifications in the app to get your workout and water reminders.',
    }
    : {
      subject: 'Boas-vindas ao EAFIT',
      preheader: 'Sua conta está pronta. Veja como começar.',
      eyebrow: 'Boas-vindas',
      heading: 'Sua conta está pronta',
      paragraphs: [
        'Que bom ter você por aqui. No EAFIT você recebe um plano de treino personalizado, registra cargas e recordes, acompanha a hidratação e vê a sua evolução.',
        'Para ter o app sempre à mão, abra eafit.com.br/app no celular e escolha Instalar (ou Adicionar à tela de início). Depois de instalado, ele funciona mesmo sem internet.',
      ],
      cta: { label: 'Abrir o app', url: APP_URL },
      footnote: 'Dica: ative as notificações no app para receber os lembretes de treino e de água.',
    };
}

export function accountDeletedEmail(lang: Lang): EmailContent {
  return lang === 'en'
    ? {
      subject: 'Your EAFIT account was deleted',
      preheader: 'We confirm your account and data were deleted.',
      eyebrow: 'Account',
      heading: 'Your account was deleted',
      paragraphs: [
        'We confirm that your EAFIT account was deleted, as you requested. Your workouts, measurements and other data were erased and cannot be recovered.',
        'If you want to come back, just create a new account whenever you like.',
      ],
      footnote: 'Was this not you? Reply to this email as soon as possible.',
      reason: 'You are receiving this email because you had an EAFIT account.',
    }
    : {
      subject: 'Sua conta no EAFIT foi excluída',
      preheader: 'Confirmamos a exclusão da sua conta e dos seus dados.',
      eyebrow: 'Conta',
      heading: 'Sua conta foi excluída',
      paragraphs: [
        'Confirmamos a exclusão da sua conta no EAFIT, feita a seu pedido. Seus treinos, medidas e demais dados foram apagados e não podem ser recuperados.',
        'Se quiser voltar, é só criar uma conta nova quando quiser.',
      ],
      footnote: 'Não foi você? Responda a este e-mail o quanto antes.',
      reason: 'Você está recebendo este e-mail porque tinha uma conta no EAFIT.',
    };
}

// Boas-vindas só pra conta recém-criada e uma vez só: a função é chamada pelo
// app, então conta antiga (ou chamada repetida) não recebe nada.
const WELCOME_WINDOW_MS = 24 * 60 * 60 * 1000;

export function shouldSendWelcome(
  user: { created_at?: string | null; app_metadata?: unknown },
  now: Date = new Date(),
): boolean {
  if ((user.app_metadata as { welcome_email_at?: unknown } | null | undefined)?.welcome_email_at) return false;
  const created = user.created_at ? new Date(user.created_at).getTime() : NaN;
  if (!Number.isFinite(created)) return false;
  return now.getTime() - created <= WELCOME_WINDOW_MS;
}
