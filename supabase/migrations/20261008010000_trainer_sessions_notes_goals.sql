-- Ambiente do personal, lote 5: treinos executados série a série, anotações
-- privadas por aluno e metas definidas pelo personal.
--
-- Mesmas regras do restante do ambiente do personal: tabelas com RLS ligado e
-- sem policies, acesso só por funções security definer que conferem o vínculo
-- ativo (is_trainer_of) antes de ler ou gravar qualquer coisa do aluno.

-- ---------------------------------------------------------------------------
-- Anotações privadas: só o personal enxerga, o aluno nunca.
-- ---------------------------------------------------------------------------
create table if not exists public.trainer_notes (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists trainer_notes_idx on public.trainer_notes (trainer_id, client_id, created_at desc);
alter table public.trainer_notes enable row level security;

create or replace function public.trainer_add_note(p_client uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 1000 then raise exception 'invalid_body'; end if;

  insert into public.trainer_notes (trainer_id, client_id, body)
  values (auth.uid(), p_client, btrim(p_body))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.trainer_client_notes(p_client uuid)
returns table (note_id uuid, note_body text, note_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  return query
    select n.id, n.body, n.created_at
    from public.trainer_notes n
    where n.trainer_id = auth.uid() and n.client_id = p_client
    order by n.created_at desc
    limit 100;
end;
$$;

create or replace function public.trainer_delete_note(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  delete from public.trainer_notes n where n.id = p_id and n.trainer_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Metas definidas pelo personal. Ficam registradas em trainer_goals (o aluno
-- vê de quem veio) E gravadas nos dados do próprio aluno (weeklyGoal /
-- pesoAlvo no perfil), que é de onde o app lê a meta semanal e a barra de
-- progresso do peso. O aluno continua podendo editar a meta dele depois.
-- ---------------------------------------------------------------------------
create table if not exists public.trainer_goals (
  client_id uuid primary key references auth.users(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  weekly_goal int check (weekly_goal between 1 and 7),
  target_weight numeric check (target_weight between 30 and 300),
  note text check (note is null or length(note) <= 300),
  updated_at timestamptz not null default now()
);

alter table public.trainer_goals enable row level security;

create or replace function public.trainer_set_goals(p_client uuid, p_weekly int, p_weight numeric, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;
  if p_weekly is null and p_weight is null then raise exception 'invalid_goals'; end if;
  if p_weekly is not null and p_weekly not between 1 and 7 then raise exception 'invalid_goals'; end if;
  if p_weight is not null and p_weight not between 30 and 300 then raise exception 'invalid_goals'; end if;
  if p_note is not null and length(p_note) > 300 then raise exception 'invalid_goals'; end if;

  insert into public.trainer_goals (client_id, trainer_id, weekly_goal, target_weight, note, updated_at)
  values (p_client, auth.uid(), p_weekly, p_weight, nullif(btrim(coalesce(p_note, '')), ''), now())
  on conflict (client_id) do update
    set trainer_id = excluded.trainer_id, weekly_goal = excluded.weekly_goal,
        target_weight = excluded.target_weight, note = excluded.note, updated_at = now();

  update auth.users u
  set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('weeklyGoal', p_weekly, 'pesoAlvo', p_weight))
  where u.id = p_client;
end;
$$;

-- O personal lê a meta que definiu.
create or replace function public.trainer_client_goals(p_client uuid)
returns table (goal_weekly int, goal_weight numeric, goal_note text, goal_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  return query
    select g.weekly_goal, g.target_weight, g.note, g.updated_at
    from public.trainer_goals g
    where g.client_id = p_client and g.trainer_id = auth.uid();
end;
$$;

-- O aluno lê a meta do personal com vínculo ativo.
create or replace function public.my_trainer_goals()
returns table (goal_weekly int, goal_weight numeric, goal_note text, goal_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select g.weekly_goal, g.target_weight, g.note, g.updated_at
  from public.trainer_goals g
  join public.trainer_clients c on c.trainer_id = g.trainer_id and c.client_id = g.client_id and c.status = 'active'
  where g.client_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Treinos executados (série a série) de um aluno, do mais recente ao mais
-- antigo. Só sessões com treino concluído ou ao menos uma série concluída.
-- ---------------------------------------------------------------------------
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
               select jsonb_agg(jsonb_build_object('exercise', es.exercise_name, 'n', es.set_number, 'carga', es.carga, 'reps', es.reps)
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

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke execute on function public.trainer_add_note(uuid, text) from public, anon;
revoke execute on function public.trainer_client_notes(uuid) from public, anon;
revoke execute on function public.trainer_delete_note(uuid) from public, anon;
revoke execute on function public.trainer_set_goals(uuid, int, numeric, text) from public, anon;
revoke execute on function public.trainer_client_goals(uuid) from public, anon;
revoke execute on function public.my_trainer_goals() from public, anon;
revoke execute on function public.trainer_client_sessions(uuid, int) from public, anon;

grant execute on function public.trainer_add_note(uuid, text) to authenticated;
grant execute on function public.trainer_client_notes(uuid) to authenticated;
grant execute on function public.trainer_delete_note(uuid) to authenticated;
grant execute on function public.trainer_set_goals(uuid, int, numeric, text) to authenticated;
grant execute on function public.trainer_client_goals(uuid) to authenticated;
grant execute on function public.my_trainer_goals() to authenticated;
grant execute on function public.trainer_client_sessions(uuid, int) to authenticated;
