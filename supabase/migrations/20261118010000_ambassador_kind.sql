-- Influenciadores: mesmo programa do embaixador (código, link ?ref=, vínculo
-- no cadastro, painel no app e no admin) — só muda o nome. Cada conta tem um
-- único papel; o admin escolhe o tipo ao criar e pode trocar depois.
-- Base: 20261108010000_ambassadors.sql e 20261109010000_ambassador_panel.sql.
--
-- As funções que ganham o tipo no retorno são recriadas (drop + create). As
-- chamadas antigas continuam valendo: os parâmetros novos têm padrão.

alter table public.ambassadors
  add column if not exists kind text not null default 'embaixador';

alter table public.ambassadors drop constraint if exists ambassadors_kind_check;
alter table public.ambassadors add constraint ambassadors_kind_check
  check (kind in ('embaixador', 'influenciador'));

-- ---------------------------------------------------------------------------
-- Gestão
-- ---------------------------------------------------------------------------
drop function if exists public.admin_create_ambassador(text, text, text);

create or replace function public.admin_create_ambassador(p_email text, p_name text, p_code text, p_kind text default 'embaixador')
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_kind text := coalesce(nullif(btrim(p_kind), ''), 'embaixador');
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if v_code !~ '^[a-z0-9-]{3,30}$' then raise exception 'invalid_code'; end if;
  if v_kind not in ('embaixador', 'influenciador') then raise exception 'invalid_kind'; end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if v_user is null then raise exception 'user_not_found'; end if;
  if exists (select 1 from public.ambassadors a where a.user_id = v_user) then raise exception 'already_ambassador'; end if;
  if exists (select 1 from public.ambassadors a where a.code = v_code) then raise exception 'code_taken'; end if;

  if v_name = '' then
    select coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email, '@', 1))
    into v_name from auth.users u where u.id = v_user;
  end if;

  insert into public.ambassadors (user_id, name, code, kind, created_by)
  values (v_user, left(v_name, 80), v_code, v_kind, auth.uid())
  returning id into v_id;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), v_user, 'createAmbassador', jsonb_build_object('code', v_code, 'name', v_name, 'kind', v_kind));
  return v_id;
end;
$$;

revoke execute on function public.admin_create_ambassador(text, text, text, text) from public, anon;
grant execute on function public.admin_create_ambassador(text, text, text, text) to authenticated;

-- p_kind nulo mantém o tipo atual.
drop function if exists public.admin_update_ambassador(uuid, text, text, boolean);

create or replace function public.admin_update_ambassador(p_id uuid, p_name text, p_code text, p_active boolean, p_kind text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_kind text;
  r public.ambassadors;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if v_code !~ '^[a-z0-9-]{3,30}$' then raise exception 'invalid_code'; end if;
  if v_name = '' then raise exception 'invalid_name'; end if;

  select * into r from public.ambassadors where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  v_kind := coalesce(nullif(btrim(p_kind), ''), r.kind);
  if v_kind not in ('embaixador', 'influenciador') then raise exception 'invalid_kind'; end if;
  if exists (select 1 from public.ambassadors a where a.code = v_code and a.id <> p_id) then raise exception 'code_taken'; end if;

  update public.ambassadors
  set name = left(v_name, 80), code = v_code, kind = v_kind, active = coalesce(p_active, active), updated_at = now()
  where id = p_id;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), r.user_id, 'updateAmbassador', jsonb_build_object(
    'code', v_code, 'previousCode', r.code, 'name', v_name, 'active', coalesce(p_active, r.active),
    'kind', v_kind, 'previousKind', r.kind));
end;
$$;

revoke execute on function public.admin_update_ambassador(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.admin_update_ambassador(uuid, text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Painel do admin
-- ---------------------------------------------------------------------------
drop function if exists public.admin_ambassadors(int);

create or replace function public.admin_ambassadors(days_back int default 30)
returns table (
  am_id uuid, am_user uuid, am_email text, am_name text, am_code text, am_active boolean, am_created timestamptz,
  am_visits bigint, am_signups bigint, am_total bigint, am_active_7d bigint, am_last_signup timestamptz, am_kind text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select a.id, a.user_id, u.email::text, a.name, a.code, a.active, a.created_at,
      (select count(*) from public.page_visits v
         where v.ref = a.code and (since is null or v.visited_on >= since)),
      (select count(*) from public.ambassador_referrals r
         where r.ambassador_id = a.id
           and (since is null or (r.linked_at at time zone 'America/Sao_Paulo')::date >= since)),
      (select count(*) from public.ambassador_referrals r where r.ambassador_id = a.id),
      (select count(*) from public.ambassador_referrals r
         join public.user_client uc on uc.user_id = r.user_id
         where r.ambassador_id = a.id and uc.last_seen >= today - 6),
      (select max(r.linked_at) from public.ambassador_referrals r where r.ambassador_id = a.id),
      a.kind
    from public.ambassadors a
    left join auth.users u on u.id = a.user_id
    order by a.active desc, a.created_at desc;
end;
$$;

revoke execute on function public.admin_ambassadors(int) from public, anon;
grant execute on function public.admin_ambassadors(int) to authenticated;

drop function if exists public.admin_user_ambassador(uuid);

create or replace function public.admin_user_ambassador(p_user uuid)
returns table (am_id uuid, am_name text, am_code text, ar_source text, ar_linked timestamptz, am_kind text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select a.id, a.name, a.code, r.source, r.linked_at, a.kind
    from public.ambassador_referrals r
    join public.ambassadors a on a.id = r.ambassador_id
    where r.user_id = p_user;
end;
$$;

revoke execute on function public.admin_user_ambassador(uuid) from public, anon;
grant execute on function public.admin_user_ambassador(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Painel no app
-- ---------------------------------------------------------------------------
drop function if exists public.my_ambassador_summary(int);

create or replace function public.my_ambassador_summary(days_back int default 30)
returns table (
  am_name text, am_code text, am_active boolean,
  am_visits bigint, am_signups bigint, am_total bigint, am_active_7d bigint, am_kind text
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
  if auth.uid() is null then return; end if;

  return query
    select a.name, a.code, a.active,
      (select count(*) from public.page_visits v
         where v.ref = a.code and (since is null or v.visited_on >= since)),
      (select count(*) from public.ambassador_referrals r
         where r.ambassador_id = a.id
           and (since is null or (r.linked_at at time zone 'America/Sao_Paulo')::date >= since)),
      (select count(*) from public.ambassador_referrals r where r.ambassador_id = a.id),
      (select count(*) from public.ambassador_referrals r
         join public.user_client uc on uc.user_id = r.user_id
         where r.ambassador_id = a.id and uc.last_seen >= today - 6),
      a.kind
    from public.ambassadors a
    where a.user_id = auth.uid();
end;
$$;

revoke execute on function public.my_ambassador_summary(int) from public, anon;
grant execute on function public.my_ambassador_summary(int) to authenticated;
