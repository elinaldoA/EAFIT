-- Marketing: o story "treino" saía às 16:30 (BRT), faixa em que os stories do Instagram alcançam ~15 contas
-- (45 dias de métricas); entre 7h e 12h o alcance médio é de 69 a 361. Passa para 11:30 BRT (14:30 UTC), colado na
-- faixa das 12h. cron.alter_job troca só a agenda e preserva o comando; job inexistente é ignorado.
select cron.alter_job(jobid, schedule := '30 14 * * *')
from cron.job where jobname = 'marketing-autopost-story-treino';
