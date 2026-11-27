-- EAFIT Arena: "forma" do herói, o quanto a pessoa realmente treinou.
--
-- O corpo do herói reflete o treino: quanto mais consistente, mais forte e
-- definido (na direção do objetivo da pessoa); parando de treinar, volta a ficar
-- sem forma. A conta é feita aqui, em cima do que existe de verdade (workouts e
-- runs), e não do XP da Arena: assim vale também para quem já treinava antes de
-- a Arena ligar e não depende de nada do jogo.
--
-- Janela de 8 semanas, da mais recente para a mais antiga. Em cada uma, os dias
-- com treino ou corrida (distintos, horário de Brasília) são comparados com a
-- meta semanal da pessoa (1 a 7 dias, padrão 5), cada semana pesando menos que a
-- seguinte mais recente:
--   semana 0 (últimos 7 dias) 25%, 20%, 16%, 12%, 9%, 7%, 6%, 5%.
-- Passar da meta não rende mais que 100% da semana. O resultado vai de 0 a 100.
-- Corrida só entra com o módulo Run liberado (mesmo portão da Arena).
-- A meta semanal vem do perfil no app (a conta pode não tê-la); só afeta o
-- visual da própria pessoa, por isso é aceita como parâmetro.

create or replace function public.arena_my_form(p_weekly_goal int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := public.arena_today();
  target int := least(7, greatest(1, coalesce(p_weekly_goal, 5)));
  run_ok boolean := public.arena_run_released();
  weights constant numeric[] := array[0.25, 0.20, 0.16, 0.12, 0.09, 0.07, 0.06, 0.05];
  weeks int[];
  score numeric := 0;
  w int;
begin
  if uid is null then return null; end if;

  with d as (
    select (coalesce((wk.started_at at time zone 'America/Sao_Paulo')::date, wk.workout_date)) as dd
    from public.workouts wk
    where wk.user_id = uid and (wk.completed or wk.finished_at is not null)
      and wk.workout_date >= today - 56
    union
    select r.run_date from public.runs r
    where run_ok and r.user_id = uid and r.run_date >= today - 56
  )
  select array_agg(c order by wn) into weeks
  from (
    select g.wn, (select count(*) from d where d.dd between today - 7 * g.wn - 6 and today - 7 * g.wn)::int as c
    from generate_series(0, 7) g(wn)
  ) t;

  for w in 0..7 loop
    score := score + weights[w + 1] * least(1, weeks[w + 1]::numeric / target);
  end loop;

  return jsonb_build_object('score', round(score * 100)::int, 'target', target,
                            'this_week', weeks[1], 'weeks', to_jsonb(weeks));
end;
$$;

revoke execute on function public.arena_my_form(int) from public, anon;
grant execute on function public.arena_my_form(int) to authenticated;
