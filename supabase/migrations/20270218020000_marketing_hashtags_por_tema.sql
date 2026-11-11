-- Hashtags por tema na fila de publicação automática. Até aqui todo post saía com as mesmas
-- 5 tags (#personaltrainer #treino #appdetreino #academia #musculacao). Agora cada post leva
-- um mix de alcance (#treino/#academia/#fitnessbrasil), nicho do assunto e marca (#EAFIT).
-- Só mexe em feed/reel ainda não publicados nem pulados. Idempotente: depois da troca a linha
-- antiga não existe mais.
update public.marketing_autopost_queue q
set caption = replace(
  q.caption,
  '#personaltrainer #treino #appdetreino #academia #musculacao',
  case
    when q.key like 'personal-%' or q.key in ('consultoria-feed', 'retencao-feed', 'treinador-voz-feed', 'trocar-treino-feed', 'tempo-personal-feed')
      then '#personaltrainer #treinopersonalizado #appparapersonal #treino #EAFIT'
    when q.key like 'nutri%' or q.key like 'agua-%'
      then '#nutricao #vidasaudavel #alimentacaosaudavel #treino #EAFIT'
    when q.key = 'temporada-novembro-azul-feed'
      then '#novembroazul #saudedohomem #vidasaudavel #treino #EAFIT'
    when q.key in ('meta-janeiro-feed', 'temporada-ano-novo-feed')
      then '#anonovo #treinodejaneiro #fitnessbrasil #academia #EAFIT'
    when q.key in ('erros-iniciante-feed', 'erros-feed', 'mitos-feed', 'iniciante-reel', 'primeira-semana-feed', 'sinais-feed', 'treino-parado-feed', 'retorno-reel')
      then '#iniciantenaacademia #treino #academia #musculacao #EAFIT'
    when q.key in ('treino-casa-feed', 'tempo-curto-reel')
      then '#treinoemcasa #treino #fitnessbrasil #vidasaudavel #EAFIT'
    when q.key in ('desafio-7-dias-feed', 'liga-feed', 'liga-mes-reel', 'amigos-feed', 'amigos-atividade-feed', 'retrospectiva-reel', 'evolucao-feed', 'evolucao-reel', 'recordes-feed', 'progressao-feed', 'historico-feed', 'historico-reel')
      then '#desafiofitness #fitnessbrasil #treino #academia #EAFIT'
    else '#fitnessbrasil #treino #academia #appfitness #EAFIT'
  end
)
where q.format in ('feed', 'reel')
  and q.posted_at is null
  and q.skipped_at is null
  and q.caption like '%#personaltrainer #treino #appdetreino #academia #musculacao%';
