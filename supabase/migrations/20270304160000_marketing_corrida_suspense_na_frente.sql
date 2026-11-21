-- Marketing do Run: as peças de suspense passam para a frente da fila (posições negativas, na mesma ordem em que
-- foram criadas). A agenda do painel (Marketing > Publicar) ordena só por position e ignora as regras do Run
-- (foco, "só antes" / "só depois do lançamento"); com as peças no fim da fila ela mostrava primeiro os stories
-- de lançamento e os de rotina, e não o que realmente vai sair. A publicação em si segue as regras do banco.
update public.marketing_autopost_queue q
set position = s.novo
from (
  select id, -100 + row_number() over (order by position) as novo
  from public.marketing_autopost_queue
  where key like 'suspense-corrida-%' and posted_at is null
) s
where q.id = s.id;
