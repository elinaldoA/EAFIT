// Roteiro dos destaques do Instagram (Marketing → Destaques): os stories de cada destaque,
// com o print do app (arquivo em eafit.com.br/img/app) e o texto da arte. `print: null` =
// arte só com texto. Depoimentos não entra aqui: só vale com relato real e autorizado.
// Corrida fica de fora até o módulo ser liberado (nenhum print `run-*`).
export const HIGHLIGHT_SCRIPTS = {
  // Gravação do fluxo real de um aluno novo (lib/highlightFlows.js): dados sendo preenchidos no
  // onboarding, ficha de saúde e o treino gerado. `at` = segundo da gravação em que a legenda troca.
  comecar: [
    { print: 'criar-conta', headline: 'Seu treino no celular em 1 minuto', subline: 'Crie sua conta e comece hoje', seconds: 3.5 },
    {
      flow: 'comecar',
      chapters: [
        { at: 0, headline: 'Conte um pouco sobre você', subline: 'Sexo, idade, peso, altura, objetivo e nível' },
        { at: 10.8, headline: 'Ficha de saúde em 7 perguntas', subline: 'O app orienta, sem bloquear o seu treino' },
        { at: 19.9, headline: 'Seu treino já montado', subline: 'Dias, exercícios e cargas sugeridas' },
      ],
    },
    { print: null, headline: 'Pronto para começar?', subline: 'Link na bio: eafit.com.br', seconds: 3.5 },
  ],
  treinos: [
    { print: 'treino', headline: 'Treino pronto em segundos', subline: 'Monte, envie e acompanhe' },
    { print: 'ao-vivo', headline: 'Registre cada série na hora', subline: 'Treino ao vivo, sem papel' },
    { print: 'carga', headline: 'A carga do último treino sempre à mão', subline: 'Não esqueça quanto você levantou' },
    { print: null, headline: 'RIR e tipos de série', subline: 'Drop-set, rest-pause, cluster e até a falha' },
    { print: 'historico', headline: 'Todo o histórico num só lugar', subline: 'Treinos, cargas e datas' },
    { print: null, headline: 'Academia, condomínio ou casa', subline: 'Seu treino acompanha você' },
  ],
  nutricao: [
    { print: 'nutricao', headline: 'Treino e dieta no mesmo app', subline: 'Treino, calorias e macros juntos' },
    { print: 'nutricao-diario', headline: 'Diário de nutrição rápido', subline: 'Registre as refeições em segundos' },
    { print: 'nutricao-macros', headline: 'Macros do dia', subline: 'Veja proteína, carboidrato e gordura' },
    { print: 'nutricao-semana', headline: 'A semana inteira', subline: 'Acompanhe sua constância na alimentação' },
    { print: 'agua', headline: 'Meta de água em dia', subline: 'Um hábito simples que muda o treino' },
  ],
  evolucao: [
    { print: 'evolucao', headline: 'Quem vê a evolução não desiste', subline: 'Cada carga vira progresso' },
    { print: 'recordes', headline: 'Recordes', subline: 'Cada carga nova vira conquista' },
    { print: 'consistencia', headline: 'Consistência', subline: 'Seus dias treinados em sequência' },
    { print: 'musculos', headline: 'Músculos trabalhados', subline: 'Veja o que você mais treina' },
    { print: 'amigos', headline: 'Treine com amigos', subline: 'Acompanhe a atividade de quem você segue' },
  ],
  personal: [
    { print: 'pt-painel', headline: 'O painel do personal', subline: 'Todos os alunos num só lugar' },
    { print: 'pt-montar-treino', headline: 'Treino montado em segundos', subline: 'Já no celular do aluno' },
    { print: 'pt-modelos', headline: 'Modelos de treino', subline: 'Reaproveite e envie' },
    { print: 'pt-ficha', headline: 'Ficha completa do aluno', subline: 'Treinos, evolução e ficha de saúde' },
    { print: 'pt-alertas', headline: 'Alertas de quem sumiu', subline: 'Aja antes de perder o aluno' },
    { print: 'pt-agenda', headline: 'Agenda e conversa com o aluno', subline: 'Tudo no app' },
  ],
  // Telas do modo do programa no app (prints de demonstração: usuária fictícia "Ana").
  embaixador: [
    { print: 'emb-painel', headline: 'Seja embaixador EAFIT', subline: 'Indique o app e acompanhe seus resultados' },
    { print: 'emb-link', headline: 'Seu código, seu link', subline: 'Cada cadastro pelo seu link fica ligado a você' },
    { print: 'emb-numeros', headline: 'Painel de resultados', subline: 'Visitas, cadastros e canais, dia a dia' },
    { print: 'emb-recados', headline: 'Recados da equipe', subline: 'Novidades e metas direto no app' },
    { print: null, headline: 'Quer participar?', subline: 'Fale com a gente pelo link da bio' },
  ],
  influenciador: [
    { print: 'infl-painel', headline: 'Seu painel de influenciador', subline: 'Cadastros, metas e ranking, tudo no app' },
    { print: 'infl-link', headline: 'Seu link e seu QR Code', subline: 'Cada cadastro entra nos seus resultados' },
    { print: 'infl-textos', headline: 'Textos prontos para postar', subline: 'Bio, stories e WhatsApp, já com o seu link' },
    { print: 'infl-material', headline: 'Material da equipe', subline: 'Logos, prints e vídeos prontos para divulgar' },
    { print: 'infl-numeros', headline: 'Seus números', subline: 'Visitas, cadastros e canais, dia a dia' },
    { print: null, headline: 'Quer participar?', subline: 'Link na bio: eafit.com.br' },
  ],
};

// Horários dos stories de um destaque: `count` stories a partir de `start`, um a cada
// `gapMinutes`. Datas em ISO.
export function highlightSchedule(start, count, gapMinutes = 60) {
  const t0 = new Date(start).getTime();
  if (Number.isNaN(t0)) return [];
  return Array.from({ length: count }, (_, i) => new Date(t0 + i * gapMinutes * 60_000).toISOString());
}
