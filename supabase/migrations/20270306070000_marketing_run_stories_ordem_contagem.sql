-- Marketing do Run: o story de suspense sem slot sai 1x por dia (só o cron das 12:30 pega itens sem slot), então
-- restam 6 saídas até o lançamento (25 a 30/11). Coloca a contagem regressiva (s10, "1º de dezembro, às 10h") na
-- 6ª posição, para sair em 30/11 em vez de ficar por último e nunca sair antes do lançamento.
update public.marketing_autopost_queue q
set position = v.pos
from (values
  ('suspense-corrida-s03-story', -99),
  ('suspense-corrida-s04-story', -98),
  ('suspense-corrida-s05-story', -97),
  ('suspense-corrida-s06-story', -96),
  ('suspense-corrida-s07-story', -95),
  ('suspense-corrida-s10-story', -94),
  ('suspense-corrida-s08-story', -93),
  ('suspense-corrida-s09-story', -92)
) as v(key, pos)
where q.key = v.key and q.posted_at is null;
