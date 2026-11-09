-- Menos publicações por dia: o retorno não acompanhou o volume.
--
-- Antes: 9 stories + 1 feed + 1 Reel por dia. Agora:
--   stories (4/dia): 07:30 bom dia (08:00 sáb e dom) · 10:00 criar conta · 12:30 geral · 16:30 hora do treino
--   feed (3/semana): seg, qua e sex às 11:30
--   Reel (3/semana): ter e qui às 20:45, sáb às 18:30
-- Saem: story café, hidratação, geral 17h30 e geral 19h30. Itens pendentes dessas faixas
-- ficam na fila, sem sair. Painel: AUTOPOST_LANES em app-admin/src/lib/marketing.js.
-- Horários em UTC (Brasília = UTC-3); cron.unschedule falha se o job não existe, então
-- o bloco ignora jobs ausentes.

do $$
declare j text;
begin
  foreach j in array array[
    'marketing-autopost-story-cafe', 'marketing-autopost-story-cafe-fds',
    'marketing-autopost-story-agua', 'marketing-autopost-story-17h30', 'marketing-autopost-story',
    'marketing-autopost-story-19h30', 'marketing-autopost-story-jantar',
    'marketing-autopost-feed', 'marketing-autopost-feed-fds',
    'marketing-autopost-reel', 'marketing-autopost-reel-fds'
  ] loop
    begin
      perform cron.unschedule(j);
    exception when others then null;
    end;
  end loop;
end $$;

select cron.schedule('marketing-autopost-feed', '30 14 * * 1,3,5', $$ select public.marketing_autopost_run('feed'); $$);
select cron.schedule('marketing-autopost-reel', '45 23 * * 2,4', $$ select public.marketing_autopost_run('reel'); $$);
select cron.schedule('marketing-autopost-reel-fds', '30 21 * * 6', $$ select public.marketing_autopost_run('reel'); $$);
