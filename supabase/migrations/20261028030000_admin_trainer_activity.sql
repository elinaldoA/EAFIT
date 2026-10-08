-- Painel admin: atividade dos personais (página "Personais"). Só contagens de
-- aulas e recados — o texto dos recados, o local e a observação das aulas são
-- conversa entre personal e aluno e não aparecem aqui.

-- Por personal: aulas dos últimos `days_back` dias por situação, aulas futuras
-- em aberto e recados enviados no período.
create or replace function public.admin_trainer_activity(days_back int default 30)
returns table (
  ta_user uuid,
  ta_appts bigint, ta_confirmed bigint, ta_declined bigint, ta_cancelled bigint, ta_pending bigint,
  ta_upcoming bigint,
  ta_messages bigint, ta_read bigint, ta_last_message timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => least(greatest(coalesce(days_back, 30), 1), 365));
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select t.user_id,
           count(a.id) filter (where a.starts_at >= since and a.starts_at <= now()),
           count(a.id) filter (where a.starts_at >= since and a.starts_at <= now() and a.status = 'confirmed'),
           count(a.id) filter (where a.starts_at >= since and a.starts_at <= now() and a.status = 'declined'),
           count(a.id) filter (where a.starts_at >= since and a.starts_at <= now() and a.status = 'cancelled'),
           count(a.id) filter (where a.starts_at >= since and a.starts_at <= now() and a.status = 'pending'),
           count(a.id) filter (where a.starts_at > now() and a.status in ('pending', 'confirmed')),
           (select count(*) from public.trainer_messages m
             where m.trainer_id = t.user_id and m.created_at >= since),
           (select count(*) from public.trainer_messages m
             where m.trainer_id = t.user_id and m.created_at >= since and m.read_at is not null),
           (select max(m.created_at) from public.trainer_messages m where m.trainer_id = t.user_id)
    from public.trainers t
    left join public.trainer_appointments a on a.trainer_id = t.user_id
    group by t.user_id;
end;
$$;

-- Próximas aulas marcadas (pendentes ou confirmadas), de todos os personais.
create or replace function public.admin_upcoming_appointments(max_rows int default 30)
returns table (
  ua_id uuid, ua_trainer uuid, ua_trainer_name text, ua_client uuid, ua_client_name text,
  ua_starts timestamptz, ua_duration int, ua_status text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select a.id, a.trainer_id,
           coalesce(nullif(btrim(tu.raw_user_meta_data->>'nome'), ''), nullif(btrim(tu.raw_user_meta_data->>'apelido'), ''), tu.email::text),
           a.client_id,
           coalesce(nullif(btrim(cu.raw_user_meta_data->>'nome'), ''), nullif(btrim(cu.raw_user_meta_data->>'apelido'), ''), cu.email::text),
           a.starts_at, a.duration_min, a.status
    from public.trainer_appointments a
    join auth.users tu on tu.id = a.trainer_id
    join auth.users cu on cu.id = a.client_id
    where a.starts_at > now() and a.status in ('pending', 'confirmed')
    order by a.starts_at
    limit least(greatest(coalesce(max_rows, 30), 1), 200);
end;
$$;

revoke execute on function public.admin_trainer_activity(int) from public, anon;
revoke execute on function public.admin_upcoming_appointments(int) from public, anon;
grant execute on function public.admin_trainer_activity(int) to authenticated;
grant execute on function public.admin_upcoming_appointments(int) to authenticated;
