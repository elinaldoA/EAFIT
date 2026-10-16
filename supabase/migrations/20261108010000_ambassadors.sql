-- Embaixadores (influenciadores da marca): cada um tem um código e um link
-- de divulgação (https://eafit.com.br/?ref=CODIGO). Quem chega pelo link e
-- cria conta fica vinculado ao embaixador, e o painel admin mostra os
-- vinculados (Pessoas → Embaixadores).
--
-- Como o vínculo acontece:
--   1. A landing (public/landing/assets/site.js) e o app (lib/ambassadorRef.js)
--      guardam o ?ref= no navegador por 30 dias (o primeiro link vale) e
--      mandam o código junto da visita anônima (page_visits.ref) — são os
--      cliques no link.
--   2. No cadastro, o app envia o código guardado em user_metadata.ref
--      (e o canal em refSource). O trigger em auth.users abaixo resolve o
--      código e grava ambassador_referrals. Código desconhecido ou de
--      embaixador inativo é ignorado; o cadastro nunca falha por causa disso.
--
-- Embaixador que exclui a própria conta: o registro e os vinculados ficam
-- (user_id vira null, o nome continua). Vinculado que exclui a conta: o
-- vínculo some junto (deleteUserData + cascade).

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.ambassadors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 80),
  code text not null unique check (code ~ '^[a-z0-9-]{3,30}$'),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma conta é embaixadora no máximo uma vez.
create unique index if not exists ambassadors_user_idx on public.ambassadors (user_id) where user_id is not null;

alter table public.ambassadors enable row level security;

drop policy if exists "admin reads ambassadors" on public.ambassadors;
create policy "admin reads ambassadors" on public.ambassadors
  for select using (public.is_admin());

revoke all on public.ambassadors from anon, authenticated;
grant select on public.ambassadors to authenticated;

create table if not exists public.ambassador_referrals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  source text not null default 'direto' check (source ~ '^[a-z0-9_-]{1,40}$'),
  linked_at timestamptz not null default now()
);

create index if not exists ambassador_referrals_ambassador_idx on public.ambassador_referrals (ambassador_id, linked_at);

alter table public.ambassador_referrals enable row level security;

drop policy if exists "admin reads ambassador referrals" on public.ambassador_referrals;
create policy "admin reads ambassador referrals" on public.ambassador_referrals
  for select using (public.is_admin());

revoke all on public.ambassador_referrals from anon, authenticated;

-- Cliques no link: a visita anônima passa a levar o código (sem validar aqui;
-- o painel só conta código que existe).
alter table public.page_visits
  add column if not exists ref text;

alter table public.page_visits drop constraint if exists page_visits_ref_check;
alter table public.page_visits add constraint page_visits_ref_check
  check (ref is null or ref ~ '^[a-z0-9-]{3,30}$');

create index if not exists page_visits_ref_idx on public.page_visits (ref, visited_on) where ref is not null;

grant insert (page, source, os, browser, device, lang, campaign, ref) on public.page_visits to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Vínculo no cadastro
-- ---------------------------------------------------------------------------
create or replace function public.link_ambassador_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(btrim(coalesce(new.raw_user_meta_data->>'ref', '')));
  v_source text := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'refSource', ''), '[^a-zA-Z0-9_-]', '', 'g'));
  v_amb uuid;
begin
  if v_code !~ '^[a-z0-9-]{3,30}$' then return new; end if;
  if v_source = '' then v_source := 'direto'; end if;

  select a.id into v_amb from public.ambassadors a where a.code = v_code and a.active;
  if v_amb is null then return new; end if;

  insert into public.ambassador_referrals (user_id, ambassador_id, source)
  values (new.id, v_amb, left(v_source, 40))
  on conflict (user_id) do nothing;
  return new;
exception when others then
  -- Métrica nunca pode impedir alguém de criar conta.
  return new;
end;
$$;

revoke execute on function public.link_ambassador_on_signup() from public, anon, authenticated;

drop trigger if exists link_ambassador_on_signup on auth.users;
create trigger link_ambassador_on_signup
  after insert on auth.users
  for each row execute function public.link_ambassador_on_signup();

-- ---------------------------------------------------------------------------
-- 3. Gestão (só admin; cada mudança vai para a auditoria)
-- ---------------------------------------------------------------------------

-- Cria o embaixador a partir do e-mail de uma conta existente.
create or replace function public.admin_create_ambassador(p_email text, p_name text, p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if v_code !~ '^[a-z0-9-]{3,30}$' then raise exception 'invalid_code'; end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if v_user is null then raise exception 'user_not_found'; end if;
  if exists (select 1 from public.ambassadors a where a.user_id = v_user) then raise exception 'already_ambassador'; end if;
  if exists (select 1 from public.ambassadors a where a.code = v_code) then raise exception 'code_taken'; end if;

  if v_name = '' then
    select coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email, '@', 1))
    into v_name from auth.users u where u.id = v_user;
  end if;

  insert into public.ambassadors (user_id, name, code, created_by)
  values (v_user, left(v_name, 80), v_code, auth.uid())
  returning id into v_id;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), v_user, 'createAmbassador', jsonb_build_object('code', v_code, 'name', v_name));
  return v_id;
end;
$$;

revoke execute on function public.admin_create_ambassador(text, text, text) from public, anon;
grant execute on function public.admin_create_ambassador(text, text, text) to authenticated;

-- Edita nome, código e situação. Trocar o código invalida o link antigo
-- (quem já se cadastrou continua vinculado).
create or replace function public.admin_update_ambassador(p_id uuid, p_name text, p_code text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_name text := btrim(coalesce(p_name, ''));
  r public.ambassadors;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if v_code !~ '^[a-z0-9-]{3,30}$' then raise exception 'invalid_code'; end if;
  if v_name = '' then raise exception 'invalid_name'; end if;

  select * into r from public.ambassadors where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if exists (select 1 from public.ambassadors a where a.code = v_code and a.id <> p_id) then raise exception 'code_taken'; end if;

  update public.ambassadors
  set name = left(v_name, 80), code = v_code, active = coalesce(p_active, active), updated_at = now()
  where id = p_id;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), r.user_id, 'updateAmbassador', jsonb_build_object(
    'code', v_code, 'previousCode', r.code, 'name', v_name, 'active', coalesce(p_active, r.active)));
end;
$$;

revoke execute on function public.admin_update_ambassador(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_update_ambassador(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Painel
-- ---------------------------------------------------------------------------

-- Um embaixador por linha: visitas pelo link e cadastros no período, total
-- de vinculados e quantos deles abriram o app nos últimos 7 dias.
create or replace function public.admin_ambassadors(days_back int default 30)
returns table (
  am_id uuid, am_user uuid, am_email text, am_name text, am_code text, am_active boolean, am_created timestamptz,
  am_visits bigint, am_signups bigint, am_total bigint, am_active_7d bigint, am_last_signup timestamptz
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
      (select max(r.linked_at) from public.ambassador_referrals r where r.ambassador_id = a.id)
    from public.ambassadors a
    left join auth.users u on u.id = a.user_id
    order by a.active desc, a.created_at desc;
end;
$$;

revoke execute on function public.admin_ambassadors(int) from public, anon;
grant execute on function public.admin_ambassadors(int) to authenticated;

-- Contas vinculadas a um embaixador, das mais recentes para as mais antigas.
create or replace function public.admin_ambassador_referrals(p_ambassador uuid)
returns table (
  ar_user uuid, ar_email text, ar_name text, ar_source text, ar_linked timestamptz,
  ar_confirmed boolean, ar_last_seen date, ar_workouts bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select r.user_id, u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), '')::text,
           r.source, r.linked_at, u.email_confirmed_at is not null, uc.last_seen,
           (select count(*) from public.workouts w where w.user_id = r.user_id and w.completed)
    from public.ambassador_referrals r
    join auth.users u on u.id = r.user_id
    left join public.user_client uc on uc.user_id = r.user_id
    where r.ambassador_id = p_ambassador
    order by r.linked_at desc;
end;
$$;

revoke execute on function public.admin_ambassador_referrals(uuid) from public, anon;
grant execute on function public.admin_ambassador_referrals(uuid) to authenticated;

-- Ficha do usuário: por qual embaixador a conta chegou (vazio = nenhum).
create or replace function public.admin_user_ambassador(p_user uuid)
returns table (am_id uuid, am_name text, am_code text, ar_source text, ar_linked timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select a.id, a.name, a.code, r.source, r.linked_at
    from public.ambassador_referrals r
    join public.ambassadors a on a.id = r.ambassador_id
    where r.user_id = p_user;
end;
$$;

revoke execute on function public.admin_user_ambassador(uuid) from public, anon;
grant execute on function public.admin_user_ambassador(uuid) to authenticated;
