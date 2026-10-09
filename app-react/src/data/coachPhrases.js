// Falas do treinador por voz, por tom e situação. Sempre em português (a voz
// só é oferecida no idioma pt) e de propósito fora do t(): são texto falado,
// não interface. Escritas de forma neutra de gênero — servem tanto para a voz
// feminina quanto para a masculina.
//
// Placeholders: {nome} {saudacao} {foco} {exercicio} {detalhe}
// {tempo} {carga} {feitos} {meta} {dia} {proximo} {ultimaCarga} {ultimasReps}
// {sugestao} {repsAlvo} {dica} {duracao} {series}.
//
// Aberturas: start = treino do dia ainda por fazer; startOther = treino de outro
// dia da semana (nunca dizer "hoje"); review = treino que já foi concluído. Linha com {nome} só é sorteada quando o
// usuário tem nome cadastrado. O mesmo vale para {proximo}: toda situação que o
// usa precisa de ao menos uma fala sem ele (o último exercício não tem próximo).
//
// Além do roteiro fixo, o treinador comenta o que está acontecendo: a semana
// (weekFirst, weekLast, weekGoal), a carga da última vez (suggestLoad,
// suggestReps, plateau), o andamento (lastSet, exerciseDone, halfway, allDone)
// e o resumo do fim (finishStats).
//
// 'light' = falas que ainda saem no modo "só o essencial".
// 'free' = falas que só saem no modo "à vontade", em que ele toma a iniciativa:
// dicas no descanso, pausa/retomada e um chamado quando o treino fica parado.
export const TONES = ['animado', 'zoeira', 'calmo'];

export const LIGHT_EVENTS = ['start', 'startOther', 'review', 'restDone', 'pr', 'finish', 'weekFirst', 'weekLast', 'weekGoal'];

export const FREE_EVENTS = ['technique', 'tip', 'idle', 'paused', 'resumed'];

export const PHRASES = {
  animado: {
    start: [
      '{saudacao}, {nome}! Hoje é dia de {foco}. Bora?',
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
    weekFirst: [
      'Primeiro treino da semana. Bora começar com o pé direito!',
      'Semana nova começando agora. Vamos dar o tom!',
      'É o primeiro da semana. Capricha, que ele puxa os outros!',
    ],
    weekLast: [
      'Esse treino fecha a sua meta da semana. Vamos buscar!',
      'Falta só esse pra bater a meta da semana. Bora fechar!',
      'Último treino da meta semanal. Fecha com chave de ouro!',
    ],
    weekGoal: [
      'E tem mais: meta da semana batida! Que semana!',
      'Meta da semana completa! Isso é constância!',
      'Semana fechada, {nome}! Todos os treinos feitos!',
    ],
    suggestLoad: [
      'Da última vez foram {ultimaCarga} quilos por {ultimasReps}. Hoje dá pra subir pra {sugestao}!',
      'Você fechou {ultimasReps} repetições com {ultimaCarga} quilos. Bora tentar {sugestao}?',
      'Hora de evoluir: {sugestao} quilos hoje. Da última vez foram {ultimaCarga}.',
    ],
    suggestReps: [
      'Da última vez foram {ultimaCarga} quilos por {ultimasReps}. Mantém a carga e busca {repsAlvo}!',
      'Mesma carga de antes, {ultimaCarga} quilos, mas hoje a meta é {repsAlvo} repetições.',
      'Você fez {ultimasReps} com {ultimaCarga} quilos. Hoje tenta chegar em {repsAlvo}!',
    ],
    plateau: [
      'Essa carga de {carga} quilos travou há alguns treinos. Que tal baixar pra {sugestao} e caprichar na execução?',
      'Você está há uns treinos sem sair de {carga} quilos. Tenta {sugestao} hoje, pra destravar.',
      'Dica: recua pra {sugestao} quilos hoje. Um passo atrás pra dar dois à frente!',
    ],
    lastSet: [
      'Boa! Descansa {tempo}. Depois é a última série!',
      'Mandou bem! {tempo} de descanso e falta só uma.',
      'Isso! Respira {tempo}. A próxima é a última desse exercício, dá tudo!',
    ],
    exerciseDone: [
      'Exercício fechado! Descansa {tempo}, depois vem {proximo}.',
      'Mais um concluído! {tempo} pra respirar. Na sequência: {proximo}.',
      'Fechou esse! Descansa {tempo} e bora pro próximo.',
      'Exercício no bolso! {tempo} de descanso.',
    ],
    halfway: [
      'Metade do treino já foi! Descansa {tempo} e segue firme.',
      'Você passou da metade! {tempo} de descanso. Tá voando!',
      'Meio caminho andado! Respira {tempo}, que agora é ladeira abaixo.',
    ],
    allDone: [
      'Todas as séries feitas! É só finalizar o treino.',
      'Acabou tudo! Pode fechar o treino, você mandou muito bem.',
      'Última série concluída! Treino completo, pode finalizar.',
    ],
    finishStats: [
      'Foram {series} séries em {duracao}.',
      'Você fez {series} séries em {duracao}. Baita treino!',
      '{duracao} de treino e {series} séries no total.',
    ],
    technique: [
      'Dica desse exercício: {dica}.',
      'Presta atenção nisso aqui: {dica}.',
      'Pra próxima série, lembra: {dica}.',
    ],
    tip: [
      'Aproveita pra tomar um gole de água.',
      'Solta os ombros e respira fundo.',
      'Na próxima, controla a descida. É ali que o músculo trabalha.',
      'Lembra de soltar o ar na hora da força.',
      'Qualidade antes de carga: movimento completo sempre.',
      'Se a última repetição saiu fácil, dá pra subir a carga.',
    ],
    idle: [
      'Ei, ainda tô aqui! Bora pra próxima série de {exercicio}?',
      'Tudo certo por aí? {exercicio} tá te esperando!',
      'Não esfria! Vamos voltar pra {exercicio}.',
    ],
    paused: [
      'Treino pausado. Te espero aqui!',
      'Pausa feita. Volta logo, hein!',
      'Pausado. Quando voltar, é só continuar.',
    ],
    resumed: [
      'De volta! Bora continuar.',
      'Voltou! Vamos retomar de onde paramos.',
      'Boa! Seguindo o treino.',
    ],
  },

  zoeira: {
    start: [
      '{saudacao}, {nome}! Hoje é {foco}, e o sofá que se vire sem você.',
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
    weekFirst: [
      'Primeiro treino da semana. A parte mais difícil era aparecer, e você apareceu.',
      'Semana zerada, bora pontuar. O primeiro é sempre o mais chato.',
      'Abrindo a semana! Depois desse, os outros vêm no embalo. Ou não.',
    ],
    weekLast: [
      'Esse treino fecha a meta da semana. Depois dele, o sofá é seu por direito.',
      'Falta só esse pra bater a meta. Não vai amarelar agora, né?',
      'Último da meta semanal. Capricha, que eu quero comemorar.',
    ],
    weekGoal: [
      'E ainda bateu a meta da semana! Quem é você e o que fez com a preguiça?',
      'Meta da semana completa! Pode postar, eu deixo.',
      'Semana fechada, {nome}! Nem eu esperava. Brincadeira, esperava sim.',
    ],
    suggestLoad: [
      'Da última vez foram {ultimaCarga} quilos por {ultimasReps}. Tava fácil demais, hoje é {sugestao}.',
      'Você fez {ultimasReps} com {ultimaCarga} quilos. Chega de moleza: {sugestao} hoje.',
      'Sobe pra {sugestao} quilos. Os {ultimaCarga} da última vez já podem se aposentar.',
    ],
    suggestReps: [
      'Da última vez foram {ultimaCarga} quilos por {ultimasReps}. Mesma carga, mas hoje eu quero {repsAlvo}.',
      'Segura os {ultimaCarga} quilos e arranca {repsAlvo} repetições. Uma a mais não mata. Eu acho.',
      'Você fez {ultimasReps} com {ultimaCarga} quilos. Hoje é {repsAlvo}, sem negociar.',
    ],
    plateau: [
      'Você e os {carga} quilos estão num relacionamento estagnado. Baixa pra {sugestao} e reacende a chama.',
      'Faz uns treinos que {carga} quilos não sai do lugar. Tenta {sugestao} hoje, sem orgulho.',
      'Travou em {carga} quilos. Recua pra {sugestao}, que ninguém tá olhando.',
    ],
    lastSet: [
      'Boa! Descansa {tempo}. Depois é a última, e aí eu paro de encher.',
      '{tempo} de descanso e falta só uma. Dá pra aguentar, vai.',
      'Respira {tempo}. A próxima é a última desse, então sem economizar.',
    ],
    exerciseDone: [
      'Esse já era! Descansa {tempo}. Próxima vítima: {proximo}.',
      'Exercício fechado! {tempo} pra recuperar a dignidade. Depois vem {proximo}.',
      'Menos um! Descansa {tempo} e finge que tá animado pro próximo.',
      'Fechou esse! {tempo} de paz.',
    ],
    halfway: [
      'Metade do treino! Descansa {tempo}. Agora já não dá mais pra desistir.',
      'Passou da metade! {tempo} de descanso. O pior já foi. Ou não, vamos ver.',
      'Meio caminho andado! Respira {tempo}, que o resto é lucro.',
    ],
    allDone: [
      'Acabou tudo! Pode finalizar o treino antes que eu invente mais série.',
      'Todas as séries feitas! Finaliza aí e corre pro banho.',
      'Última série concluída. Sobreviveu! Pode fechar o treino.',
    ],
    finishStats: [
      'Foram {series} séries em {duracao}. Nada mau pra quem não queria vir.',
      '{series} séries em {duracao}. Eu contei, pode confiar.',
      '{duracao} de treino e {series} séries. O sofá vai ouvir falar disso.',
    ],
    technique: [
      'Dica de quem só olha e não levanta nada: {dica}.',
      'Anota aí: {dica}. Depois me agradece.',
      'Pra próxima série: {dica}. Sem roubar!',
    ],
    tip: [
      'Bebe água. Não, café não conta.',
      'Solta esse ombro, que ele tá quase encostando na orelha.',
      'Controla a descida. Largar o peso não é técnica, é desistência.',
      'Respira! Prender o ar e ficar roxo não aumenta a carga.',
      'Movimento completo, hein. Meia repetição vale meia.',
      'Se a última saiu fácil, tá na hora de botar mais peso. Desculpa.',
    ],
    idle: [
      'Alô? Ainda tá aí? {exercicio} não vai se fazer sozinho.',
      'Esse descanso já virou férias. Bora voltar pra {exercicio}!',
      'Larga o celular! Tem série de {exercicio} te esperando.',
    ],
    paused: [
      'Treino pausado. Vou fingir que acredito que você volta.',
      'Pausa! Não some, hein.',
      'Pausado. Fico aqui contando os segundos. Literalmente.',
    ],
    resumed: [
      'Olha quem voltou! Bora.',
      'Voltou! Eu já tava ficando com saudade.',
      'Fim do recreio. Seguindo!',
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
    weekFirst: [
      'Este é o primeiro treino da semana. Um bom começo.',
      'Começando a semana. Vamos com calma e constância.',
      'Primeiro treino da semana. Sem pressa.',
    ],
    weekLast: [
      'Com este treino você fecha a meta da semana.',
      'Falta apenas este treino para completar a meta semanal.',
      'Este é o último treino da meta da semana. Vamos com atenção.',
    ],
    weekGoal: [
      'Você completou a meta da semana. Parabéns pela constância.',
      'Meta semanal concluída. Excelente trabalho.',
      'Todos os treinos da semana feitos, {nome}. Muito bem.',
    ],
    suggestLoad: [
      'Da última vez foram {ultimaCarga} quilos por {ultimasReps} repetições. Hoje, experimente {sugestao} quilos.',
      'Você completou {ultimasReps} repetições com {ultimaCarga} quilos. Pode subir para {sugestao}.',
      'Sugestão de carga: {sugestao} quilos. Na última vez foram {ultimaCarga}.',
    ],
    suggestReps: [
      'Da última vez foram {ultimaCarga} quilos por {ultimasReps}. Mantenha a carga e busque {repsAlvo} repetições.',
      'Mesma carga de antes, {ultimaCarga} quilos. Hoje, tente {repsAlvo} repetições.',
      'Você fez {ultimasReps} repetições com {ultimaCarga} quilos. O objetivo hoje é {repsAlvo}.',
    ],
    plateau: [
      'A carga de {carga} quilos está parada há alguns treinos. Experimente {sugestao} quilos, com foco na execução.',
      'Você está estável em {carga} quilos. Reduzir para {sugestao} hoje pode ajudar a evoluir.',
      'Sugestão: {sugestao} quilos hoje, para recuperar e voltar a progredir.',
    ],
    lastSet: [
      'Bom trabalho. Descanse {tempo}. A próxima é a última série.',
      'Muito bem. {tempo} de descanso. Falta uma série.',
      'Isso. Respire por {tempo}. Depois, a última série deste exercício.',
    ],
    exerciseDone: [
      'Exercício concluído. Descanse {tempo}. Em seguida, {proximo}.',
      'Muito bem. {tempo} de descanso. O próximo é {proximo}.',
      'Exercício concluído. Descanse {tempo}.',
      'Bom trabalho neste exercício. Respire por {tempo}.',
    ],
    halfway: [
      'Você está na metade do treino. Descanse {tempo}.',
      'Metade concluída. {tempo} de descanso. Siga no seu ritmo.',
      'Meio do treino. Respire por {tempo} e continue com calma.',
    ],
    allDone: [
      'Todas as séries concluídas. Você pode finalizar o treino.',
      'Última série feita. Quando quiser, finalize o treino.',
      'Treino completo. Pode finalizar com tranquilidade.',
    ],
    finishStats: [
      'Foram {series} séries em {duracao}.',
      'Você completou {series} séries em {duracao}.',
      '{duracao} de treino, com {series} séries.',
    ],
    technique: [
      'Uma orientação para este exercício: {dica}.',
      'Na próxima série, lembre-se: {dica}.',
      'Atenção a este ponto: {dica}.',
    ],
    tip: [
      'Aproveite para beber um pouco de água.',
      'Relaxe os ombros e respire fundo.',
      'Na próxima série, desça o peso devagar.',
      'Solte o ar durante o esforço.',
      'Prefira o movimento completo a uma carga maior.',
      'Se a última repetição foi fácil, considere aumentar a carga.',
    ],
    idle: [
      'Quando quiser, vamos para a próxima série de {exercicio}.',
      'Sem pressa. {exercicio} continua esperando por você.',
      'Tudo bem por aí? Podemos continuar com {exercicio}.',
    ],
    paused: [
      'Treino pausado. Volte quando quiser.',
      'Pausa registrada. Estarei aqui.',
      'Treino em pausa.',
    ],
    resumed: [
      'Que bom ter você de volta. Vamos continuar.',
      'Retomando o treino.',
      'Continuando, no seu ritmo.',
    ],
  },
};
