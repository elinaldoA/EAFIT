-- Programa de maratona no EAFIT Run (16 semanas, só intermediário e avançado).
-- run_day_planned espelha app-react/src/modules/corrida/program.js: sem 'maratona'
-- na lista de objetivos, quem escolheu esse programa nunca receberia o lembrete
-- de "hoje é dia de correr". Iniciante cai no 10K, como na meia maratona.
-- Só esta função muda; o restante da migration 20270206010000 segue igual.

create or replace function public.run_day_planned(md jsonb, d date)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  goal text := md->>'runGoal';
  lvl text := case when md->>'runNivel' in ('iniciante', 'avancado') then md->>'runNivel' else 'intermediario' end;
  dow int := (extract(dow from d)::int + 6) % 7;
  weeks int;
  start date;
  w int := 0;
begin
  if goal is null or goal not in ('5k', '10k', 'meia', 'maratona', 'livre') then return false; end if;
  if goal in ('meia', 'maratona') and lvl = 'iniciante' then goal := '10k'; end if;
  weeks := case goal when '5k' then 8 when '10k' then 10 when 'meia' then 12 when 'maratona' then 16 else 0 end;
  if md->>'runStart' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    start := (md->>'runStart')::date;
    start := start - ((extract(dow from start)::int + 6) % 7);
    if d - start >= 0 then w := (d - start) / 7 + 1; end if;
  end if;
  if weeks > 0 and w between 1 and weeks then
    return case lvl
      when 'avancado' then dow in (0, 1, 3, 4, 5)
      when 'intermediario' then dow in (0, 2, 4, 5)
      else dow in (0, 2, 5) end;
  end if;
  return dow in (0, 2, 5);
exception when others then
  return false;
end;
$$;

revoke execute on function public.run_day_planned(jsonb, date) from public, anon, authenticated;
grant execute on function public.run_day_planned(jsonb, date) to service_role;
