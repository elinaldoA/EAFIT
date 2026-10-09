// Textos dos e-mails enviados pelas Edge Functions (boas-vindas, conta
// excluída), em pt e en. Separado das funções pra ser testável sem rede; o
// visual vem de emailLayout.ts. Os e-mails do login (redefinição de senha,
// confirmação, avisos de segurança) ficam em supabase/templates/build.ts.
import { APP_URL, type EmailContent } from './emailLayout.ts';
import { INACTIVITY_REASONS, type InactivityReason, reasonLabel } from './inactivity.ts';
import type { Lang } from './lang.ts';
import type { WhyEmail } from './weeklyEmails.ts';

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

// Resumo da semana passada (mesmos números do push de segunda de manhã:
// treinos concluídos, meta semanal e soma das cargas).
export function weeklySummaryEmail(lang: Lang, count: number, goal: number, volume: number): EmailContent {
  const hit = count >= goal;
  return lang === 'en'
    ? {
      subject: hit ? 'Weekly goal hit! Your week on EAFIT' : 'Your week on EAFIT',
      preheader: `${count} of ${goal} workouts completed last week.`,
      eyebrow: 'Weekly summary',
      heading: hit ? 'Weekly goal hit!' : 'Your week in numbers',
      paragraphs: [
        `Last week you completed ${count} of the ${goal} workouts in your weekly goal, with ${volume} kg of total volume.`,
        hit ? 'Great work. Keep the pace this week.' : 'A new week is starting: how about one more workout than last week?',
      ],
      cta: { label: 'See my progress', url: `${APP_URL}#dash` },
    }
    : {
      subject: hit ? 'Meta semanal batida! Sua semana no EAFIT' : 'Sua semana no EAFIT',
      preheader: `${count} de ${goal} treinos concluídos na semana passada.`,
      eyebrow: 'Resumo semanal',
      heading: hit ? 'Meta semanal batida!' : 'Sua semana em números',
      paragraphs: [
        `Na semana passada você concluiu ${count} dos ${goal} treinos da sua meta semanal, com ${volume} kg de volume total.`,
        hit ? 'Ótimo trabalho. Mantenha o ritmo nesta semana.' : 'Uma semana nova está começando: que tal um treino a mais que na anterior?',
      ],
      cta: { label: 'Ver minha evolução', url: `${APP_URL}#dash` },
    };
}

// Convite pra voltar: quem parou há 1 a 4 semanas, ou criou a conta e ainda
// não fez o primeiro treino.
export function comebackEmail(lang: Lang, days: number, neverTrained: boolean): EmailContent {
  if (neverTrained) {
    return lang === 'en'
      ? {
        subject: 'Your first workout is waiting',
        preheader: 'It only takes a few minutes to start.',
        eyebrow: 'Getting started',
        heading: 'Your first workout is waiting',
        paragraphs: [
          'You created your EAFIT account, but have not logged a workout yet. In a few minutes the app builds your plan and you can do the first one.',
        ],
        cta: { label: 'Start my first workout', url: `${APP_URL}#treino` },
      }
      : {
        subject: 'Seu primeiro treino está esperando',
        preheader: 'Leva poucos minutos pra começar.',
        eyebrow: 'Primeiros passos',
        heading: 'Seu primeiro treino está esperando',
        paragraphs: [
          'Você criou sua conta no EAFIT, mas ainda não registrou nenhum treino. Em poucos minutos o app monta o seu plano e você já faz o primeiro.',
        ],
        cta: { label: 'Começar meu primeiro treino', url: `${APP_URL}#treino` },
      };
  }
  return lang === 'en'
    ? {
      subject: 'We miss you at EAFIT',
      preheader: `It has been ${days} days since your last workout.`,
      eyebrow: 'Come back',
      heading: 'How about getting back to it today?',
      paragraphs: [
        `It has been ${days} days since your last workout. Your plan, your loads and your history are right where you left them.`,
        'One short workout is enough to get back into the rhythm.',
      ],
      cta: { label: 'Open the workout of the day', url: `${APP_URL}#treino` },
    }
    : {
      subject: 'Sentimos sua falta no EAFIT',
      preheader: `Já são ${days} dias desde o seu último treino.`,
      eyebrow: 'Hora de voltar',
      heading: 'Que tal voltar hoje?',
      paragraphs: [
        `Já são ${days} dias desde o seu último treino. Seu plano, suas cargas e seu histórico estão do jeito que você deixou.`,
        'Um treino curto já basta pra retomar o ritmo.',
      ],
      cta: { label: 'Abrir o treino de hoje', url: `${APP_URL}#treino` },
    };
}

// Pesquisa de inatividade: passou das 4 semanas do convite pra voltar, então
// pergunta o motivo. Cada opção é um link que já registra a resposta
// (`linkFor`, ver inactivity.ts). 'absent' = sumiu do app; 'idle' = continua
// entrando, mas não treina.
export function inactivityEmail(
  lang: Lang,
  pick: Pick<WhyEmail, 'segment' | 'days' | 'neverTrained'>,
  linkFor: (reason: InactivityReason) => string,
): EmailContent {
  const choices = INACTIVITY_REASONS.map((reason) => ({ label: reasonLabel(lang, reason), url: linkFor(reason) }));
  const en = lang === 'en';
  const ask = en
    ? 'We want to make the app better, and your answer helps a lot. What got in the way? One tap is enough:'
    : 'Queremos melhorar o app, e a sua resposta ajuda muito. O que atrapalhou? Um toque já basta:';
  const cta = { label: en ? 'Open the app' : 'Abrir o app', url: `${APP_URL}#treino` };
  const footnote = en
    ? 'Your plan and your history are still saved, whenever you want to come back.'
    : 'Seu plano e seu histórico continuam guardados, pra quando você quiser voltar.';

  if (pick.segment === 'idle') {
    const lead = pick.neverTrained
      ? (en
        ? 'You have opened EAFIT recently, but have not logged a workout yet.'
        : 'Você abriu o EAFIT recentemente, mas ainda não registrou nenhum treino.')
      : (en
        ? `You have opened EAFIT recently, but it has been ${pick.days} days since your last workout.`
        : `Você abriu o EAFIT recentemente, mas já são ${pick.days} dias desde o seu último treino.`);
    return {
      subject: en ? 'What is keeping you from training?' : 'O que está travando o seu treino?',
      preheader: en ? 'Tell us in one tap.' : 'Conte pra gente em um toque.',
      eyebrow: en ? 'Quick question' : 'Pergunta rápida',
      heading: en ? 'What is keeping you from training?' : 'O que está travando o seu treino?',
      paragraphs: [lead, ask],
      choices,
      cta,
      footnote,
    };
  }
  return {
    subject: en ? 'What made you stop?' : 'O que fez você parar?',
    preheader: en ? 'Tell us in one tap.' : 'Conte pra gente em um toque.',
    eyebrow: en ? 'Quick question' : 'Pergunta rápida',
    heading: en ? 'It has been a while' : 'Faz tempo que você não aparece',
    paragraphs: [
      pick.neverTrained
        ? (en
          ? 'You created your EAFIT account, but have not come back to do your first workout.'
          : 'Você criou sua conta no EAFIT, mas não voltou pra fazer o primeiro treino.')
        : (en
          ? `It has been ${pick.days} days since your last workout, and you have not opened EAFIT in a while.`
          : `Já são ${pick.days} dias desde o seu último treino, e faz um tempo que você não abre o EAFIT.`),
      ask,
    ],
    choices,
    cta,
    footnote,
  };
}

// Comunicado escrito pelo admin: título e mensagem saem como foram digitados
// (cada linha vira um parágrafo); só a moldura acompanha o idioma da conta.
export function broadcastEmail(lang: Lang, title: string, message: string): EmailContent {
  const paragraphs = message.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return {
    subject: title,
    preheader: paragraphs[0],
    eyebrow: lang === 'en' ? 'News from EAFIT' : 'Novidades do EAFIT',
    heading: title,
    paragraphs,
    cta: { label: lang === 'en' ? 'Open the app' : 'Abrir o app', url: APP_URL },
  };
}

// Resposta da equipe a um feedback que a própria pessoa mandou pelo app.
export function feedbackReplyEmail(lang: Lang, reply: string): EmailContent {
  const paragraphs = reply.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return lang === 'en'
    ? {
      subject: 'We replied to your feedback',
      preheader: paragraphs[0],
      eyebrow: 'Feedback',
      heading: 'We replied to your feedback',
      paragraphs: ['Thank you for writing to us. Here is our reply:', ...paragraphs],
      cta: { label: 'Open the app', url: `${APP_URL}#perfil` },
      footnote: 'To continue the conversation, just reply to this email.',
    }
    : {
      subject: 'Respondemos o seu feedback',
      preheader: paragraphs[0],
      eyebrow: 'Feedback',
      heading: 'Respondemos o seu feedback',
      paragraphs: ['Obrigado por escrever pra gente. Segue a nossa resposta:', ...paragraphs],
      cta: { label: 'Abrir o app', url: `${APP_URL}#perfil` },
      footnote: 'Para continuar a conversa, é só responder a este e-mail.',
    };
}

// Boas-vindas só pra conta recém-criada e uma vez só: a função é chamada pelo
// app, então conta antiga (ou chamada repetida) não recebe nada. Com
// confirmação de e-mail ligada, o prazo conta da confirmação (quem confirma
// dias depois do cadastro ainda recebe).
const WELCOME_WINDOW_MS = 24 * 60 * 60 * 1000;

export function shouldSendWelcome(
  user: { created_at?: string | null; email_confirmed_at?: string | null; app_metadata?: unknown },
  now: Date = new Date(),
): boolean {
  if ((user.app_metadata as { welcome_email_at?: unknown } | null | undefined)?.welcome_email_at) return false;
  const since = [user.created_at, user.email_confirmed_at]
    .map((d) => (d ? new Date(d).getTime() : NaN))
    .filter(Number.isFinite);
  if (!since.length) return false;
  return now.getTime() - Math.max(...since) <= WELCOME_WINDOW_MS;
}
