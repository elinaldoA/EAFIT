// Textos dos e-mails enviados pelas Edge Functions (boas-vindas, conta
// excluída), em pt e en. Separado das funções pra ser testável sem rede; o
// visual vem de emailLayout.ts. Os e-mails do login (redefinição de senha,
// confirmação, avisos de segurança) ficam em supabase/templates/build.ts.
import { APP_URL, type EmailContent } from './emailLayout.ts';
import { INACTIVITY_REASONS, type InactivityReason, reasonLabel } from './inactivity.ts';
import type { Lang } from './lang.ts';
import type { WhyEmail } from './weeklyEmails.ts';

// Primeiro nome da pessoa (user_metadata.nome, com o apelido como alternativa),
// pra chamá-la pelo nome nos e-mails. Vazio quando a conta não tem nome.
export function firstNameOf(meta: unknown): string {
  const m = (meta ?? {}) as { nome?: unknown; apelido?: unknown };
  for (const v of [m.nome, m.apelido]) {
    if (typeof v !== 'string') continue;
    const first = v.trim().split(/\s+/)[0];
    if (first) return (first.charAt(0).toLocaleUpperCase() + first.slice(1)).slice(0, 30);
  }
  return '';
}

// Abre o texto com uma saudação pelo nome; sem nome, devolve o conteúdo como está.
function greet(lang: Lang, name: string | undefined, content: EmailContent): EmailContent {
  if (!name) return content;
  const hello = lang === 'en' ? `Hi ${name}!` : `Oi, ${name}!`;
  return { ...content, paragraphs: [hello, ...content.paragraphs] };
}

export function welcomeEmail(lang: Lang, name?: string): EmailContent {
  return greet(lang, name, lang === 'en'
    ? {
      subject: name ? `Welcome to EAFIT, ${name}!` : 'Welcome to EAFIT',
      preheader: 'Your account is ready. Here is how to get started.',
      eyebrow: 'Welcome',
      heading: 'Your account is ready',
      paragraphs: [
        'So glad you are here! With EAFIT you get a training plan made for you, you can log your loads and records, keep track of your water and watch your progress grow.',
        'Tip: to keep the app one tap away, open eafit.com.br/app on your phone and choose Install (or Add to Home Screen). Once installed, it even works without internet.',
        'Any question along the way? Just reply to this email, a real person reads it.',
      ],
      cta: { label: 'Open the app', url: APP_URL },
      footnote: 'Turn on notifications in the app and we will remind you of your workouts and your water.',
    }
    : {
      subject: name ? `Boas-vindas ao EAFIT, ${name}!` : 'Boas-vindas ao EAFIT',
      preheader: 'Sua conta está pronta. Veja como começar.',
      eyebrow: 'Boas-vindas',
      heading: 'Sua conta está pronta',
      paragraphs: [
        'Que bom ter você por aqui! No EAFIT você recebe um plano de treino feito pra você, registra suas cargas e recordes, acompanha a água do dia e vê a sua evolução crescer.',
        'Uma dica: pra deixar o app a um toque de distância, abra eafit.com.br/app no celular e escolha Instalar (ou Adicionar à tela de início). Depois de instalado, ele funciona até sem internet.',
        'Ficou com alguma dúvida? É só responder a este e-mail, tem uma pessoa de verdade lendo.',
      ],
      cta: { label: 'Abrir o app', url: APP_URL },
      footnote: 'Ative as notificações no app e a gente te lembra dos treinos e da água.',
    });
}

export function accountDeletedEmail(lang: Lang, name?: string): EmailContent {
  return greet(lang, name, lang === 'en'
    ? {
      subject: 'Your EAFIT account was deleted',
      preheader: 'We confirm your account and data were deleted.',
      eyebrow: 'Account',
      heading: 'Your account was deleted',
      paragraphs: [
        'We are sorry to see you go. As you asked, your EAFIT account was deleted, and your workouts, measurements and other data were erased for good.',
        'Thank you for the time you spent with us. If you ever want to come back, the door is open: just create a new account.',
      ],
      footnote: 'Was this not you? Reply to this email as soon as possible and we will help.',
      reason: 'You are receiving this email because you had an EAFIT account.',
    }
    : {
      subject: 'Sua conta no EAFIT foi excluída',
      preheader: 'Confirmamos a exclusão da sua conta e dos seus dados.',
      eyebrow: 'Conta',
      heading: 'Sua conta foi excluída',
      paragraphs: [
        'Poxa, vamos sentir sua falta. Como você pediu, sua conta no EAFIT foi excluída, e seus treinos, medidas e demais dados foram apagados de vez.',
        'Obrigado pelo tempo que você passou com a gente. Se um dia quiser voltar, a porta está aberta: é só criar uma conta nova.',
      ],
      footnote: 'Não foi você? Responda a este e-mail o quanto antes que a gente te ajuda.',
      reason: 'Você está recebendo este e-mail porque tinha uma conta no EAFIT.',
    });
}

// Resumo da semana passada (mesmos números do push de segunda de manhã:
// treinos concluídos, meta semanal e soma das cargas).
export type WeeklyExtras = {
  proteinDays?: number; // dias da semana com proteína registrada
  proteinAvg?: number; // média (g) nesses dias
  kcalDays?: number; // dias da semana com calorias registradas
  kcalAvg?: number; // média (kcal) nesses dias
  weightDelta?: number | null; // kg: último peso da semana menos o último anterior
};

// Linha extra do resumo (nutrição e peso); null quando não há nada a dizer.
export function weeklyExtrasLine(lang: Lang, extras: WeeklyExtras = {}): string | null {
  const en = lang === 'en';
  const parts: string[] = [];
  if (extras.proteinDays && extras.proteinDays > 0) {
    const avg = Math.round(extras.proteinAvg || 0);
    parts.push(en
      ? `you logged protein on ${extras.proteinDays} ${extras.proteinDays === 1 ? 'day' : 'days'}, averaging ${avg} g`
      : `você registrou proteína em ${extras.proteinDays} ${extras.proteinDays === 1 ? 'dia' : 'dias'}, com média de ${avg} g`);
  }
  if (extras.kcalDays && extras.kcalDays > 0 && extras.kcalAvg) {
    const kcal = Math.round(extras.kcalAvg);
    parts.push(en
      ? `your calories averaged ${kcal} kcal a day over ${extras.kcalDays} ${extras.kcalDays === 1 ? 'day' : 'days'}`
      : `suas calorias ficaram em média ${kcal} kcal por dia em ${extras.kcalDays} ${extras.kcalDays === 1 ? 'dia' : 'dias'}`);
  }
  if (typeof extras.weightDelta === 'number' && Number.isFinite(extras.weightDelta)) {
    const d = Math.round(extras.weightDelta * 10) / 10;
    const abs = Math.abs(d).toFixed(1).replace('.', en ? '.' : ',');
    parts.push(d === 0
      ? (en ? 'your weight held steady' : 'seu peso ficou estável')
      : en ? `your weight ${d < 0 ? 'dropped' : 'rose'} ${abs} kg` : `seu peso ${d < 0 ? 'caiu' : 'subiu'} ${abs} kg`);
  }
  if (!parts.length) return null;
  const text = parts.join(en ? ' and ' : ' e ');
  return en ? `Also: ${text}.` : `Além disso: ${text}.`;
}

export function weeklySummaryEmail(lang: Lang, count: number, goal: number, volume: number, extras: WeeklyExtras = {}, name?: string): EmailContent {
  const hit = count >= goal;
  const content = weeklySummaryBase(lang, count, goal, volume, hit);
  const extra = weeklyExtrasLine(lang, extras);
  if (extra) content.paragraphs.splice(1, 0, extra);
  return greet(lang, name, content);
}

function weeklySummaryBase(lang: Lang, count: number, goal: number, volume: number, hit: boolean): EmailContent {
  return lang === 'en'
    ? {
      subject: hit ? 'Weekly goal hit! Your week on EAFIT' : 'Your week on EAFIT',
      preheader: `${count} of ${goal} workouts completed last week.`,
      eyebrow: 'Weekly summary',
      heading: hit ? 'Weekly goal hit!' : 'Your week in numbers',
      paragraphs: [
        `Last week you completed ${count} of the ${goal} workouts in your weekly goal, with ${volume} kg of total volume.`,
        hit ? 'Congrats, that is real consistency! Let us keep this pace going this week.' : 'No stress, every week is a fresh start. How about one more workout than last week?',
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
        hit ? 'Parabéns, isso é constância de verdade! Vamos manter esse ritmo nesta semana.' : 'Sem pressão, toda semana é um recomeço. Que tal um treino a mais que na anterior?',
      ],
      cta: { label: 'Ver minha evolução', url: `${APP_URL}#dash` },
    };
}

// Convite pra voltar: quem parou há 1 a 4 semanas, ou criou a conta e ainda
// não fez o primeiro treino.
export function comebackEmail(lang: Lang, days: number, neverTrained: boolean, name?: string): EmailContent {
  if (neverTrained) {
    return greet(lang, name, lang === 'en'
      ? {
        subject: 'Your first workout is waiting',
        preheader: 'It only takes a few minutes to start.',
        eyebrow: 'Getting started',
        heading: 'Your first workout is waiting',
        paragraphs: [
          'You created your EAFIT account, but have not logged a workout yet. No rush: in a few minutes the app builds your plan and you can do the first one. We are rooting for you!',
        ],
        cta: { label: 'Start my first workout', url: `${APP_URL}#treino` },
      }
      : {
        subject: 'Seu primeiro treino está esperando',
        preheader: 'Leva poucos minutos pra começar.',
        eyebrow: 'Primeiros passos',
        heading: 'Seu primeiro treino está esperando',
        paragraphs: [
          'Você criou sua conta no EAFIT, mas ainda não registrou nenhum treino. Sem pressa: em poucos minutos o app monta o seu plano e você já faz o primeiro. A gente torce por você!',
        ],
        cta: { label: 'Começar meu primeiro treino', url: `${APP_URL}#treino` },
      });
  }
  return greet(lang, name, lang === 'en'
    ? {
      subject: name ? `${name}, we miss you at EAFIT` : 'We miss you at EAFIT',
      preheader: `It has been ${days} days since your last workout.`,
      eyebrow: 'Come back',
      heading: 'How about getting back to it today?',
      paragraphs: [
        `It has been ${days} days since your last workout. Your plan, your loads and your history are right where you left them.`,
        'Life gets busy, it happens to everyone. One short workout is enough to get back into the rhythm, and we will be here with you.',
      ],
      cta: { label: 'Open the workout of the day', url: `${APP_URL}#treino` },
    }
    : {
      subject: name ? `${name}, sentimos sua falta no EAFIT` : 'Sentimos sua falta no EAFIT',
      preheader: `Já são ${days} dias desde o seu último treino.`,
      eyebrow: 'Hora de voltar',
      heading: 'Que tal voltar hoje?',
      paragraphs: [
        `Já são ${days} dias desde o seu último treino. Seu plano, suas cargas e seu histórico estão do jeito que você deixou.`,
        'A vida corre, acontece com todo mundo. Um treino curto já basta pra retomar o ritmo, e a gente está aqui com você.',
      ],
      cta: { label: 'Abrir o treino de hoje', url: `${APP_URL}#treino` },
    });
}

// Pesquisa de inatividade: passou das 4 semanas do convite pra voltar, então
// pergunta o motivo. Cada opção é um link que já registra a resposta
// (`linkFor`, ver inactivity.ts). 'absent' = sumiu do app; 'idle' = continua
// entrando, mas não treina.
export function inactivityEmail(
  lang: Lang,
  pick: Pick<WhyEmail, 'segment' | 'days' | 'neverTrained'>,
  linkFor: (reason: InactivityReason) => string,
  name?: string,
): EmailContent {
  return greet(lang, name, inactivityBase(lang, pick, linkFor));
}

function inactivityBase(
  lang: Lang,
  pick: Pick<WhyEmail, 'segment' | 'days' | 'neverTrained'>,
  linkFor: (reason: InactivityReason) => string,
): EmailContent {
  const choices = INACTIVITY_REASONS.map((reason) => ({ label: reasonLabel(lang, reason), url: linkFor(reason) }));
  const en = lang === 'en';
  const ask = en
    ? 'We really want to make the app better for you, and your answer helps a lot. What got in the way? One tap is enough, no judgment:'
    : 'A gente quer deixar o app cada vez melhor pra você, e a sua resposta ajuda muito. O que atrapalhou? Um toque já basta, sem julgamentos:';
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
export function broadcastEmail(lang: Lang, title: string, message: string, name?: string): EmailContent {
  const paragraphs = message.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return greet(lang, name, {
    subject: title,
    preheader: paragraphs[0],
    eyebrow: lang === 'en' ? 'News from EAFIT' : 'Novidades do EAFIT',
    heading: title,
    paragraphs,
    cta: { label: lang === 'en' ? 'Open the app' : 'Abrir o app', url: APP_URL },
  });
}

// Resposta da equipe a um feedback que a própria pessoa mandou pelo app.
export function feedbackReplyEmail(lang: Lang, reply: string, name?: string): EmailContent {
  const paragraphs = reply.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return greet(lang, name, lang === 'en'
    ? {
      subject: 'We replied to your feedback',
      preheader: paragraphs[0],
      eyebrow: 'Feedback',
      heading: 'We replied to your feedback',
      paragraphs: ['Thank you for taking the time to write to us, it really matters. Here is our reply:', ...paragraphs],
      cta: { label: 'Open the app', url: `${APP_URL}#perfil` },
      footnote: 'To continue the conversation, just reply to this email.',
    }
    : {
      subject: 'Respondemos o seu feedback',
      preheader: paragraphs[0],
      eyebrow: 'Feedback',
      heading: 'Respondemos o seu feedback',
      paragraphs: ['Obrigado por tirar um tempo pra escrever pra gente, isso faz diferença. Segue a nossa resposta:', ...paragraphs],
      cta: { label: 'Abrir o app', url: `${APP_URL}#perfil` },
      footnote: 'Para continuar a conversa, é só responder a este e-mail.',
    });
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
