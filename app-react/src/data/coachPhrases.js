// Falas do treinador por voz, por tom e situação. Sempre em português (a voz
// só é oferecida no idioma pt) e de propósito fora do t(): são texto falado,
// não interface. Escritas de forma neutra de gênero — servem tanto para a voz
// feminina quanto para a masculina.
//
// Placeholders: {nome} {coach} {saudacao} {foco} {exercicio} {detalhe}
// {tempo} {carga} {feitos} {meta} {dia}.
//
// Aberturas: start = treino do dia ainda por fazer; startOther = treino de outro
// dia da semana (nunca dizer "hoje"); review = treino que já foi concluído. Linha com {nome} só é sorteada quando o
// usuário tem nome cadastrado.
//
// 'light' = falas que ainda saem no modo "só o essencial".
export const TONES = ['animado', 'zoeira', 'calmo'];

export const LIGHT_EVENTS = ['start', 'startOther', 'review', 'restDone', 'pr', 'finish'];

export const PHRASES = {
  animado: {
    start: [
      '{saudacao}, {nome}! Aqui é {coach}. Hoje é dia de {foco}. Bora?',
      '{saudacao}! {foco} hoje. Respira fundo, que a gente vai com tudo!',
      'Partiu {foco}! Eu tô contigo do começo ao fim.',
      '{saudacao}, {nome}! Treino de {foco} na área. Vamos fazer valer!',
      'Chegou a hora! {foco} hoje. Foco total e boa energia!',
    ],
    startOther: [
      '{saudacao}! Treino de {dia}: {foco}. Bora?',
      'Vamos de {foco}, o treino de {dia}. Estou contigo!',
      'Treino de {dia} aberto: {foco}. Foco e boa energia!',
    ],
    review: [
      'Esse treino de {foco} você já fechou! Vamos revisar, sem pressa.',
      'Revendo o treino de {foco}. Esse já está no bolso!',
      'Treino de {foco} já concluído. Bora dar uma olhada?',
    ],
    exercise: [
      'Agora é {exercicio}. {detalhe}.',
      'Próximo: {exercicio}. {detalhe}. Bora!',
      '{exercicio}! {detalhe}. Capricha na execução.',
      'Vamos de {exercicio}. {detalhe}.',
      'Chegou a vez de {exercicio}. {detalhe}. Vai com calma e com força!',
    ],
    rest: [
      'Boa! Descansa {tempo}.',
      'Mandou bem! {tempo} pra respirar.',
      'Série feita! Descanse {tempo} e toma uma água.',
      'Isso aí! Respira, {tempo} de descanso.',
      'Muito bem! Recupera esse fôlego, {tempo}.',
    ],
    rest10: [
      'Faltam dez segundos. Se preparando!',
      'Dez segundos! Já vai pegando a pegada.',
      'Dez segundos pra próxima. Bora!',
    ],
    restDone: [
      'Tempo! Vamos pra próxima!',
      'Acabou o descanso. Bora!',
      'Hora de voltar! Você consegue!',
      'Descanso concluído. Mostra a que veio!',
      'Voltando! Foco na execução.',
    ],
    pr: [
      'Recorde! {carga} quilos em {exercicio}! Que máquina!',
      'Peraí! Novo recorde em {exercicio}! {carga} quilos!',
      'É isso! Recorde batido, {nome}! {carga} quilos!',
      'Olha só! Você acabou de se superar em {exercicio}!',
    ],
    finish: [
      'Treino fechado! {feitos} de {meta} na semana. Orgulho de você!',
      'Acabou! Missão cumprida, {nome}! Já são {feitos} treinos na semana.',
      'Mandou muito bem! Treino concluído. Agora descansa e se hidrata!',
      'Finalizado! {feitos} de {meta} na semana. Segue assim!',
    ],
  },

  zoeira: {
    start: [
      '{saudacao}, {nome}! {coach} na área. Hoje é {foco}, e o sofá que se vire sem você.',
      '{saudacao}! {foco} hoje. Prometo que dói só um pouquinho. Mentira, dói bastante.',
      'Bora de {foco}! O ferro não vai levantar sozinho, e eu já tentei.',
      '{saudacao}, {nome}! Hora do {foco}. Deixa a preguiça no vestiário.',
      'Chegou o grande momento: {foco}. Respira, alonga, e vem!',
    ],
    startOther: [
      '{saudacao}! Treino de {dia}: {foco}. Sem choro, hein!',
      'Vamos de {foco}, o treino de {dia}. Aqui ninguém foge do ferro!',
      'Treino de {dia} aberto: {foco}. Respira e vai.',
    ],
    review: [
      'Esse treino de {foco} você já fechou! Quer rever? Gostei da dedicação.',
      'Treino de {foco} já feito. Vai repetir por saudade?',
      'Revendo o treino de {foco}. Esse já tá no currículo!',
    ],
    exercise: [
      '{exercicio}. {detalhe}. Sem choro, hein!',
      'Agora é {exercicio}. {detalhe}. Segura a cara de dor, que a gente tá filmando. Mentira.',
      'Vem de {exercicio}! {detalhe}. Eu acredito em você, mais ou menos.',
      '{exercicio}, {detalhe}. Capricha, que eu tô olhando!',
      'Próxima vítima: {exercicio}. {detalhe}.',
    ],
    rest: [
      'Boa! {tempo} de descanso. Não vale pegar o celular pra rolar o feed.',
      'Respira! {tempo} pra fingir que não tá cansado.',
      'Descanse {tempo}. Eu também vou fingir que descanso.',
      'Mandou bem! {tempo} de paz. Aproveita, que passa rápido.',
      'Isso! {tempo} pra recuperar a dignidade.',
    ],
    rest10: [
      'Dez segundos! O descanso tá acabando, e eu não tenho culpa.',
      'Faltam dez. Hora de fazer cara de quem tá tranquilo.',
      'Dez segundos pra voltar. Sem drama!',
    ],
    restDone: [
      'Acabou a moleza! Vamos!',
      'Tempo! Volta pro ferro!',
      'Descanso encerrado. Desculpa, mas é a vida.',
      'Voltando! Sem enrolar.',
      'Pronto, acabou. Bora lá!',
    ],
    pr: [
      'PERAÍ! Recorde em {exercicio}! {carga} quilos! Tá voando!',
      'Recorde! {carga} quilos! Segura a onda aí!',
      'Novo recorde em {exercicio}! Nem eu acreditei!',
      'Bateu o recorde! {carga} quilos. Pode se achar um pouquinho.',
    ],
    finish: [
      'Treino fechado! {feitos} de {meta} na semana. Pode ir pro sofá, você mereceu.',
      'Acabou! Sobreviveu, {nome}! {feitos} treinos na semana.',
      'Missão cumprida! Agora come bem e descansa, que músculo cresce na folga.',
      'Fim de treino! {feitos} de {meta}. Que orgulho, quase chorei. Quase.',
    ],
  },

  calmo: {
    start: [
      '{saudacao}, {nome}. Hoje é {foco}. Sem pressa, no seu ritmo.',
      '{saudacao}. Vamos de {foco}. Respire fundo e comece quando quiser.',
      'Treino de {foco}. Foco na execução e na respiração.',
      '{saudacao}, {nome}. Estou aqui com você. Vamos começar.',
    ],
    startOther: [
      '{saudacao}. Treino de {dia}: {foco}. No seu ritmo.',
      'Vamos de {foco}, o treino de {dia}. Com calma e atenção.',
      'Treino de {dia} aberto: {foco}. Respire fundo.',
    ],
    review: [
      'Você já concluiu esse treino de {foco}. Vamos revisar com calma.',
      'Treino de {foco} já feito. Dê uma olhada com tranquilidade.',
      'Revisando o treino de {foco}. Bom trabalho por ter concluído.',
    ],
    exercise: [
      'Próximo exercício: {exercicio}. {detalhe}.',
      '{exercicio}. {detalhe}. Com controle.',
      'Agora, {exercicio}. {detalhe}. Sem pressa.',
      'Vamos de {exercicio}. {detalhe}. Atenção na postura.',
    ],
    rest: [
      'Bom trabalho. Descanse {tempo}.',
      'Muito bem. Respire, {tempo} de descanso.',
      'Série concluída. Descanso de {tempo}.',
      'Isso. Recupere o fôlego por {tempo}.',
    ],
    rest10: [
      'Faltam dez segundos.',
      'Dez segundos para a próxima série.',
      'Dez segundos. Vá se preparando.',
    ],
    restDone: [
      'Descanso concluído. Vamos para a próxima.',
      'Tempo. Pode começar.',
      'Quando quiser, vamos.',
      'Hora de continuar, com calma.',
    ],
    pr: [
      'Novo recorde em {exercicio}: {carga} quilos. Parabéns.',
      'Você bateu um recorde, {nome}. {carga} quilos. Excelente.',
      'Recorde em {exercicio}. Seu esforço está dando resultado.',
    ],
    finish: [
      'Treino concluído. {feitos} de {meta} na semana. Bom trabalho.',
      'Terminamos, {nome}. Alongue um pouco e hidrate-se.',
      'Muito bem. {feitos} treinos nesta semana. Descanse bem.',
    ],
  },
};

// Nome do treinador por voz.
export const COACH_NAMES = { female: 'Bia', male: 'Beto' };
