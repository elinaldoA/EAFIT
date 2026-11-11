-- As sessoes do aluno vistas pelo personal passam a trazer o RIR e o tipo
-- (drop-set, rest-pause, cluster, falha) de cada serie.

create or replace function public.trainer_client_sessions(p_client uuid, p_limit int default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  select coalesce(jsonb_agg(q.s order by q.s->>'date' desc), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
             'id', w.id,
             'date', w.workout_date,
             'day', w.day_of_week,
             'completed', w.completed,
             'duration', w.duration_seconds,
             'rating', w.rating,
             'notes', w.notes,
             'sets', coalesce((
               select jsonb_agg(jsonb_build_object('exercise', es.exercise_name, 'n', es.set_number, 'carga', es.carga, 'reps', es.reps,
                                                   'rir', es.rir, 'tipo', es.tipo)
                                order by es.exercise_name, es.set_number)
               from public.exercise_sets es
               where es.workout_id = w.id and es.completed
             ), '[]'::jsonb)
           ) as s
    from public.workouts w
    where w.user_id = p_client
      and (w.completed or exists (select 1 from public.exercise_sets x where x.workout_id = w.id and x.completed))
    order by w.workout_date desc
    limit least(greatest(p_limit, 1), 40)
  ) q;

  return result;
end;
$$;
