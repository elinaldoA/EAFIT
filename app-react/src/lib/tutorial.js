import { t, lang } from './i18n';
import { isFlagOn } from './appConfig';
import { isVoiceSupported } from './voice';
// Tutorial guiado do app: passos do aluno e do personal + controle de "já viu".
// Cada passo pode levar a uma aba (`tab`) e destacar um elemento (`target`, um
// seletor CSS). Se o elemento não existir na tela, o passo aparece centralizado.
// `dashTab` abre essa aba dentro da Evolução; `flag` e `when` escondem o passo
// quando o recurso está desligado (ver visibleSteps).
const DONE_KEY = 'eafit_tutorial_done';
export const TUTORIAL_EVENT = 'eafit:tutorial';

const nav = n => `.bottom-nav .nav-item:nth-child(${n})`;

export const STUDENT_STEPS = [
  {
    icon: '👋', title: t('Bem-vindo ao EAFIT'),
    text: t('Em poucos passos você conhece tudo o que o app faz. Dá pra pular a qualquer momento e rever depois em Perfil → Ajuda.'),
  },
  {
    tab: 'treino', target: '#page-treino .progress-card', icon: '🏋️', title: t('Seu treino da semana'),
    text: t('Aqui ficam o card "Treino de hoje" e a semana atual. Cada dia abre com os exercícios, séries, repetições e descanso. Marque as séries concluídas e anote a carga usada.'),
  },
  {
    tab: 'treino', target: '#page-treino .checkin', flag: 'checkin_diario', icon: '🙂', title: t('Como você está hoje?'),
    text: t('Antes de treinar, responda em 3 toques como estão sua energia, seu sono e seu humor. O app devolve uma dica do dia, e em Evolução você vê como isso muda ao longo das semanas.'),
  },
  {
    tab: 'treino', icon: '⚡', title: t('Modo treino ao vivo'),
    text: t('Toque em "Treino de hoje" (ou no ⚡ de um dia) para treinar em tela cheia: um exercício por vez, descanso com cronômetro e alarme, e a tela sempre acesa. Use "▶ Ver execução" para ver o movimento. No cardio, o cronômetro marca a duração e você anota distância e ritmo.'),
  },
  {
    tab: 'treino', when: () => lang === 'pt' && isVoiceSupported(), icon: '🎙️', title: t('Treinador por voz'),
    text: t('Ligue o treinador e ele fala com você durante o treino: anuncia cada exercício, conta o descanso e comenta o seu andamento. Escolha voz feminina ou masculina, o tom e quanto ele fala (até o modo "à vontade") em Perfil → Treinador por voz.'),
  },
  {
    tab: 'treino', target: '#page-treino .toolbar', icon: '⚙️', title: t('Ajuste o treino'),
    text: t('Em "Editar treino" você muda séries e escolhe outro plano. Num exercício, "Trocar exercício" sugere alternativas do mesmo grupo muscular, numa biblioteca com 1000 exercícios. "Limpar" zera os checks e cargas da semana.'),
  },
  {
    tab: 'treino', target: '.topbar .inbox-bell', icon: '🔔', title: t('Avisos e lembretes'),
    text: t('No sino ficam os avisos do EAFIT, as respostas ao seu feedback e as notificações. Toque num aviso para ir direto à tela do assunto e marque como lido o que já viu. Ali também você liga os lembretes de treino e de água neste aparelho.'),
  },
  {
    tab: 'historico', target: nav(2), icon: '📅', title: t('Histórico'),
    text: t('O calendário mostra os dias treinados e marca os feriados nacionais. Toque num dia para ver a sessão e comparar cada exercício com a última vez que você o fez.'),
  },
  {
    tab: 'hidratacao', target: nav(3), icon: '💧', title: t('Hidratação'),
    text: t('A meta de água é calculada pelo seu peso. Registre copo, caneca, garrafa ou squeeze com um toque (dá pra desfazer) e acompanhe sua sequência de dias na meta.'),
  },
  {
    tab: 'dash', dashTab: 'treinos', target: nav(4), icon: '📈', title: t('Evolução'),
    text: t('Em Treinos ficam a retrospectiva do mês (com cartão para compartilhar), o avatar dos músculos trabalhados, os gráficos de carga e volume e as conquistas. Em Recordes, suas melhores cargas.'),
  },
  {
    tab: 'dash', dashTab: 'treinos', flag: 'desafios', icon: '🏆', title: t('Desafios com amigos'),
    text: t('Crie um desafio com prazo e mande o código, ou entre no de alguém. O placar conta os dias treinados no período, e os desafios oficiais do EAFIT também aparecem aqui.'),
  },
  {
    tab: 'dash', dashTab: 'corpo', target: '#page-dash .seg', icon: '📏', title: t('Seu corpo'),
    text: t('Na aba Corpo você acompanha a evolução do peso, as fotos de progresso e as medidas corporais (cintura, braço, coxa e outras), com a diferença desde o primeiro registro.'),
  },
  {
    tab: 'dash', dashTab: 'amigos', target: '#page-dash .seg', flag: 'amigos', icon: '🤜', title: t('Amigos'),
    text: t('Adicione amigos pelo código pessoal, dispute o ranking semanal e acompanhe o feed com os treinos deles — dá pra reagir a cada um.'),
  },
  {
    tab: 'perfil', target: nav(5), icon: '👤', title: t('Perfil e metas'),
    text: t('Atualize peso e altura e defina as metas semanais de treino e de água. Se o peso novo mudar sua faixa de IMC, o treino é ajustado sozinho.'),
  },
  {
    tab: 'perfil', icon: '🛠️', title: t('Do seu jeito'),
    text: t('Em Preferências você troca o idioma (português ou inglês), escolhe notificações e e-mails, pausa o plano numa viagem sem perder a sequência, tranca o app com a biometria do aparelho e exporta seus dados (CSV, backup ou relatório).'),
  },
  {
    tab: 'perfil', icon: '🤝', title: t('Tem personal?'),
    text: t('Em Perfil → "Meu personal", digite o código que ele te passou (ou abra o link de convite dele e autorize). Ele passa a montar seu treino e acompanhar sua evolução; os recados e as aulas marcadas por ele aparecem no Perfil e no topo do Treino.'),
  },
  {
    tab: 'treino', icon: '🚀', title: t('Tudo pronto!'),
    text: t('Agora é só treinar. Instale o app na tela inicial para abrir rápido e usar sem internet. Tem uma ideia ou achou um problema? Mande em Perfil → Enviar feedback. Para rever este guia: Perfil → Ajuda.'),
  },
];

export const TRAINER_STEPS = [
  {
    icon: '🧑‍🏫', title: t('Bem-vindo, Personal'),
    text: t('Este é o seu painel: acompanhe alunos, monte treinos, crie desafios e mande recados. Dá pra pular e rever depois em Conta → Ajuda.'),
  },
  {
    tab: 'alunos', target: nav(1), icon: '👥', title: t('Seus alunos'),
    text: t('Toque em "Convidar aluno" para mandar seu código. Quando o aluno o digita em Perfil → Meu personal e autoriza, ele aparece aqui. Quem precisa de atenção fica no topo: parado há 4 dias ou mais, sumido há mais de uma semana ou que ainda não treinou. O card "Esta semana" resume quantos treinaram e quantos treinos fizeram.'),
  },
  {
    tab: 'alunos', target: '.trainer-link', icon: '🔗', title: t('Seu link de divulgação'),
    text: t('Poste o link na bio, nos stories ou mande no WhatsApp. Quem cria a conta por ele recebe o pedido para autorizar você e já entra na sua lista. O card mostra as visitas e as contas criadas pelo link nos últimos 30 dias e quantos alunos entraram por ele.'),
  },
  {
    tab: 'alunos', icon: '📋', title: t('Ficha do aluno'),
    text: t('Abra um aluno para ver frequência contra a meta, sequência, peso, medidas, check-ins, desconfortos e cargas máximas. Em "Últimos treinos" estão as séries registradas, com sugestões de quando subir a carga. Ali você também define metas, faz anotações que só você vê e, se o aluno ligar o compartilhamento, vê as fotos de evolução.'),
  },
  {
    tab: 'alunos', icon: '🏋️', title: t('Monte e envie o treino'),
    text: t('Na ficha, toque em "Montar treino" (ou "Editar / enviar novo treino"). Escolha os dias, os exercícios, as séries e as repetições, ou comece de um modelo. Ao enviar, o treino vira o plano ativo do aluno e ele recebe um recado avisando.'),
  },
  {
    tab: 'alunos', icon: '📅', title: t('Agenda de aulas'),
    text: t('Na ficha, no card de aulas, marque data, hora, duração e local. O aluno é avisado e confirma ou recusa pelo app, e os dois recebem lembrete antes da aula. As próximas aulas, com a situação de cada uma, aparecem no topo da lista de alunos.'),
  },
  {
    tab: 'modelos', target: nav(2), icon: '🧩', title: t('Modelos de treino'),
    text: t('Crie um modelo uma vez ("+ Novo modelo") e envie para vários alunos de uma só vez. "Editar como novo" ajusta uma cópia sem mexer no original.'),
  },
  {
    tab: 'turma', target: nav(3), icon: '🏆', title: t('Turma e desafios'),
    text: t('Crie desafios com nome e prazo para toda a turma ou só para alguns alunos. Os participantes são avisados e você acompanha o andamento.'),
  },
  {
    tab: 'recados', target: nav(4), icon: '💬', title: t('Recados e conversa'),
    text: t('Envie incentivos e orientações para todos ou para alunos escolhidos. Eles recebem uma notificação e, nos enviados, você vê quantos já leram. O aluno pode responder: a resposta aparece na lista de alunos e a conversa fica na ficha dele.'),
  },
  {
    tab: 'conta', target: nav(5), icon: '⚙️', title: t('Conta e alertas'),
    text: t('Ative as notificações neste aparelho e escolha os avisos: aluno sem treinar (você define o prazo), recorde de carga, relato de dor forte ou lesão e o resumo da semana, toda segunda. Os avisos chegam entre 8h e 20h. Quer treinar também? "Usar como aluno" troca para o app de treino.'),
  },
  {
    tab: 'alunos', icon: '🚀', title: t('Tudo pronto!'),
    text: t('Comece convidando seu primeiro aluno, pelo link ou pelo código. Para rever este guia: Conta → Ajuda.'),
  },
];

export function stepsFor(role) {
  return role === 'trainer' ? TRAINER_STEPS : STUDENT_STEPS;
}

// Passos que valem para quem está vendo: sem os recursos desligados no painel
// admin (`flag`) nem os que o aparelho não suporta (`when`).
export function visibleSteps(role, flags) {
  return stepsFor(role).filter(s => (!s.flag || isFlagOn(flags, s.flag)) && (!s.when || s.when()));
}

function key(role, userId) {
  return `${DONE_KEY}:${role}:${userId}`;
}

export function hasSeenTutorial(role, userId) {
  try { return localStorage.getItem(key(role, userId)) === '1'; } catch { return true; }
}

export function markTutorialSeen(role, userId) {
  try { localStorage.setItem(key(role, userId), '1'); } catch { /* sem storage */ }
}

// Chamado pelos botões "Ver tutorial" (Perfil e Conta do personal).
export function startTutorial() {
  window.dispatchEvent(new CustomEvent(TUTORIAL_EVENT));
}
