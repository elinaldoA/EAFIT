// Roteiro dos destaques do Instagram (Marketing → Destaques): os stories de cada destaque,
// com o print do app (arquivo em eafit.com.br/img/app) e o texto da arte. `print: null` =
// arte só com texto. Depoimentos não entra aqui: só vale com relato real e autorizado.
// Corrida fica de fora até o módulo ser liberado (nenhum print `run-*`).
export const HIGHLIGHT_SCRIPTS = {
  comecar: [
    { print: 'criar-conta', headline: 'Seu treino no celular em 1 minuto', subline: 'Crie sua conta e comece hoje' },
    { print: null, headline: 'Sem baixar da loja', subline: 'Abra eafit.com.br no celular e adicione à tela inicial' },
    { print: 'treino', headline: 'Treino do dia na palma da mão', subline: 'Veja o que fazer e registre cada série' },
    { print: null, headline: 'Ficha de saúde em 7 perguntas', subline: 'O app orienta, sem bloquear o seu treino' },
    { print: null, headline: 'Pronto para começar?', subline: 'Link na bio: eafit.com.br' },
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
  embaixador: [
    { print: null, headline: 'Seja embaixador EAFIT', subline: 'Indique o app e acompanhe quem entra pelo seu código' },
    { print: null, headline: 'Seu código, seu link', subline: 'Cada cadastro pelo seu link fica ligado a você' },
    { print: null, headline: 'Painel no Perfil', subline: 'Veja quantas pessoas se cadastraram' },
    { print: null, headline: 'Quer participar?', subline: 'Fale com a gente pelo link da bio' },
  ],
  influenciador: [
    { print: null, headline: 'Programa de influenciadores', subline: 'Divulgue o EAFIT com seu link e QR Code' },
    { print: null, headline: 'Seu link e seu QR Code', subline: 'Cada cadastro entra nos seus resultados' },
    { print: null, headline: 'Metas e marcos', subline: 'De 1 a 1.000 cadastros, acompanhe cada marco' },
    { print: null, headline: 'Material pronto para divulgar', subline: 'Textos e artes na aba Divulgar' },
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
