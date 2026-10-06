-- Agenda de aulas: o personal marca um horário com o aluno e o aluno confirma
-- ou recusa pelo app.
--
-- Como nas demais tabelas do ambiente do personal, trainer_appointments tem RLS
-- ligado e NENHUMA policy: tudo passa por funções security definer que conferem
-- o vínculo ativo. Encerrado o vínculo, o aluno deixa de ver as aulas daquele
-- personal e o personal deixa de ver as do aluno.
--
-- status: pending (aguardando o aluno) · confirmed · declined · cancelled
-- (cancelada pelo personal). Colunas de saída prefixadas em ap_*.

create table if not exists public.trainer_appointments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  duration_min int not null default 60 check (duration_min between 15 and 480),
  place text check (place is null or length(place) <= 120),
  note text check (note is null or length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists trainer_appointments_trainer_idx on public.trainer_appointments (trainer_id, starts_at);
create index if not exists trainer_appointments_client_idx on public.trainer_appointments (client_id, starts_at);

alter table public.trainer_appointments enable row level security;

-- ---------------------------------------------------------------------------
-- Personal
-- ---------------------------------------------------------------------------
create or replace function public.trainer_create_appointment(
  p_client uuid,
  p_starts timestamptz,
  p_duration int default 60,
  p_place text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_trainer() or not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;
  if p_starts is null or p_starts <= now() then raise exception 'invalid_time'; end if;
  if p_duration is null or p_duration not between 15 and 480 then raise exception 'invalid_duration'; end if;
  if length(coalesce(p_place, '')) > 120 or length(coalesce(p_note, '')) > 300 then raise exception 'invalid_text'; end if;

  if (select count(*) from public.trainer_appointments a
      where a.trainer_id = auth.uid() and a.client_id = p_client
        and a.starts_at > now() and a.status in ('pending', 'confirmed')) >= 30 then
    raise exception 'too_many';
  end if;

  insert into public.trainer_appointments (trainer_id, client_id, starts_at, duration_min, place, note)
  values (auth.uid(), p_client, p_starts, p_duration, nullif(btrim(p_place), ''), nullif(btrim(p_note), ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- Aulas do personal: de ontem em diante. p_client nulo = todos os alunos.
create or replace function public.trainer_appointments(p_client uuid default null)
returns table (
  ap_id uuid, ap_client uuid, ap_name text, ap_starts timestamptz, ap_duration int,
  ap_place text, ap_note text, ap_status text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select a.id, a.client_id,
         coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), split_part(u.email::text, '@', 1)),
         a.starts_at, a.duration_min, a.place, a.note, a.status
  from public.trainer_appointments a
  join public.trainer_clients c on c.trainer_id = a.trainer_id and c.client_id = a.client_id and c.status = 'active'
  join auth.users u on u.id = a.client_id
  where a.trainer_id = auth.uid() and public.is_trainer()
    and (p_client is null or a.client_id = p_client)
    and a.starts_at >= now() - interval '1 day'
  order by a.starts_at asc
  limit 100;
$$;

create or replace function public.trainer_cancel_appointment(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.trainer_appointments a set status = 'cancelled', responded_at = now()
  where a.id = p_id and a.trainer_id = auth.uid() and public.is_trainer()
    and a.status in ('pending', 'confirmed') and public.is_trainer_of(a.client_id);
$$;

-- ---------------------------------------------------------------------------
-- Aluno
-- ---------------------------------------------------------------------------
create or replace function public.my_appointments()
returns table (
  ap_id uuid, ap_trainer text, ap_starts timestamptz, ap_duration int,
  ap_place text, ap_note text, ap_status text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select a.id,
         coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), 'Seu personal'),
         a.starts_at, a.duration_min, a.place, a.note, a.status
  from public.trainer_appointments a
  join public.trainer_clients c on c.trainer_id = a.trainer_id and c.client_id = a.client_id and c.status = 'active'
  join auth.users u on u.id = a.trainer_id
  where a.client_id = auth.uid()
    and a.starts_at >= now() - interval '1 day'
  order by a.starts_at asc
  limit 50;
$$;

-- Confirmar ou recusar uma aula futura (dá pra mudar de ideia enquanto a aula
-- não passou e o personal não cancelou).
create or replace function public.respond_appointment(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('confirmed', 'declined') then raise exception 'invalid_status'; end if;

  update public.trainer_appointments a set status = p_status, responded_at = now()
  where a.id = p_id and a.client_id = auth.uid()
    and a.status in ('pending', 'confirmed', 'declined')
    and a.starts_at > now()
    and exists (select 1 from public.trainer_clients c
                where c.trainer_id = a.trainer_id and c.client_id = a.client_id and c.status = 'active');

  if not found then raise exception 'not_found'; end if;
end;
$$;

revoke execute on function public.trainer_create_appointment(uuid, timestamptz, int, text, text) from public, anon;
revoke execute on function public.trainer_appointments(uuid) from public, anon;
revoke execute on function public.trainer_cancel_appointment(uuid) from public, anon;
revoke execute on function public.my_appointments() from public, anon;
revoke execute on function public.respond_appointment(uuid, text) from public, anon;
grant execute on function public.trainer_create_appointment(uuid, timestamptz, int, text, text) to authenticated;
grant execute on function public.trainer_appointments(uuid) to authenticated;
grant execute on function public.trainer_cancel_appointment(uuid) to authenticated;
grant execute on function public.my_appointments() to authenticated;
grant execute on function public.respond_appointment(uuid, text) to authenticated;
