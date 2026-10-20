-- Painel admin: quem cada personal trouxe pelo link de divulgação
-- (https://eafit.com.br/app/?personal=CODIGO), como já existe para embaixadores e
-- influenciadores (20261108010000_ambassadors.sql). Os dados já são gravados
-- desde 20261119010000_trainer_invite_link.sql:
--   page_visits.personal        cliques no link
--   trainer_invite_signups      contas criadas pelo link
--   trainer_clients.source      'link' = aluno que autorizou o vínculo pelo convite
-- Aqui só entram as consultas do painel (só admin).

-- ---------------------------------------------------------------------------
-- Números do link de cada personal (Pessoas → Personais)
-- ---------------------------------------------------------------------------
create or replace function public.admin_trainer_invites(days_back int default 30)
returns table (
  ti_user uuid, ti_visits bigint, ti_signups bigint, ti_total bigint,
  ti_linked bigint, ti_active_7d bigint, ti_last_signup timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select t.user_id,
      (select count(*) from public.page_visits v
         where v.personal = t.code and (since is null or v.visited_on >= since)),
      (select count(*) from public.trainer_invite_signups s
         where s.trainer_id = t.user_id
           and (since is null or (s.created_at at time zone 'America/Sao_Paulo')::date >= since)),
      (select count(*) from public.trainer_invite_signups s where s.trainer_id = t.user_id),
      (select count(*) from public.trainer_clients c
         where c.trainer_id = t.user_id and c.status = 'active' and c.source = 'link'),
      (select count(*) from public.trainer_invite_signups s
         join public.user_client uc on uc.user_id = s.user_id
         where s.trainer_id = t.user_id and uc.last_seen >= today - 6),
      (select max(s.created_at) from public.trainer_invite_signups s where s.trainer_id = t.user_id)
    from public.trainers t;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contas criadas pelo link de um personal, das mais recentes para as antigas.
-- ts_client = virou aluno dele (vínculo ativo hoje).
-- ---------------------------------------------------------------------------
create or replace function public.admin_trainer_invite_signups(p_trainer uuid)
returns table (
  ts_user uuid, ts_email text, ts_name text, ts_created timestamptz,
  ts_confirmed boolean, ts_last_seen date, ts_workouts bigint, ts_client boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select s.user_id, u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), '')::text,
           s.created_at, u.email_confirmed_at is not null, uc.last_seen,
           (select count(*) from public.workouts w where w.user_id = s.user_id and w.completed),
           exists (select 1 from public.trainer_clients c
                   where c.trainer_id = s.trainer_id and c.client_id = s.user_id and c.status = 'active')
    from public.trainer_invite_signups s
    join auth.users u on u.id = s.user_id
    left join public.user_client uc on uc.user_id = s.user_id
    where s.trainer_id = p_trainer
    order by s.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ficha do usuário: por qual personal a conta chegou (vazio = nenhum).
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_trainer_invite(p_user uuid)
returns table (ti_trainer uuid, ti_name text, ti_code text, ti_created timestamptz, ti_client boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select s.trainer_id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), u.email::text)::text,
           t.code, s.created_at,
           exists (select 1 from public.trainer_clients c
                   where c.trainer_id = s.trainer_id and c.client_id = s.user_id and c.status = 'active')
    from public.trainer_invite_signups s
    join public.trainers t on t.user_id = s.trainer_id
    join auth.users u on u.id = s.trainer_id
    where s.user_id = p_user;
end;
$$;

revoke execute on function public.admin_trainer_invites(int) from public, anon;
revoke execute on function public.admin_trainer_invite_signups(uuid) from public, anon;
revoke execute on function public.admin_user_trainer_invite(uuid) from public, anon;
grant execute on function public.admin_trainer_invites(int) to authenticated;
grant execute on function public.admin_trainer_invite_signups(uuid) to authenticated;
grant execute on function public.admin_user_trainer_invite(uuid) to authenticated;
