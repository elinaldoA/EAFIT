-- Papéis de admin: profiles.admin_role, public.admin_can(area), a trava de
-- profiles e as policies de public.app_settings. Tudo isso foi criado direto em
-- produção pelo SQL editor e não estava em nenhuma migration — o repositório
-- ainda tinha a policy "admin write" (qualquer admin escreve) de
-- 20261006040000_app_settings.sql e a trava antiga de
-- 20260925000000_protect_is_admin.sql. Esta migration copia o que está em
-- produção (conferido em 2026-10-19); lá ela não muda nada.
--
-- Papéis (admin_can(area)):
--   superadmin : tudo, inclusive dar papel e promover admin (área 'admins')
--   suporte    : users, notifications, segments
--   conteudo   : content, settings
--   leitura    : nada (padrão de toda conta; admin "leitura" só consulta o painel)
--
-- Precisa existir ao menos um superadmin: a trava impede rebaixar o último, e
-- só superadmin muda papel. Sem nenhum, o papel só muda pelo SQL editor:
--   update public.profiles set admin_role = 'superadmin'
--   where id = (select id from auth.users where email = '<email>');
--
-- Fora daqui (ainda só em produção): as policies "admin insert/update/delete"
-- por admin_can das outras tabelas (profiles, workouts, exercise_library,
-- landing_content, scheduled_broadcasts, user_segments etc.).

alter table public.profiles
  add column if not exists admin_role text not null default 'leitura'
  constraint profiles_admin_role_check check (admin_role = any (array['superadmin', 'suporte', 'conteudo', 'leitura']));

create or replace function public.admin_can(area text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce((select p.admin_role from public.profiles p where p.id = auth.uid() and p.is_admin), '')
    when 'superadmin' then true
    when 'suporte' then area in ('users', 'notifications', 'segments')
    when 'conteudo' then area in ('content', 'settings')
    else false
  end;
$$;

grant execute on function public.admin_can(text) to authenticated;

-- Só superadmin promove admin ou muda papel; nunca fica sem superadmin.
-- SECURITY INVOKER de propósito (ver 20260925000000_protect_is_admin.sql).
create or replace function public.guard_profiles_is_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if (coalesce(new.is_admin, false) or new.admin_role <> 'leitura') and not public.admin_can('admins') then
      raise exception 'not_authorized: só um superadmin pode definir admin/papel' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.is_admin is distinct from old.is_admin or new.admin_role is distinct from old.admin_role)
     and not public.admin_can('admins') then
    raise exception 'not_authorized: só um superadmin pode definir admin/papel' using errcode = '42501';
  end if;

  -- não deixar o sistema sem superadmin (rebaixar ou remover o último)
  if old.is_admin and old.admin_role = 'superadmin'
     and (not new.is_admin or new.admin_role <> 'superadmin')
     and not exists (
       select 1 from public.profiles p
       where p.id <> old.id and p.is_admin and p.admin_role = 'superadmin'
     ) then
    raise exception 'last_superadmin: precisa existir ao menos um superadmin' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- app_settings: leitura pública ("public read") e do admin; escrita por papel.
drop policy if exists "admin write" on public.app_settings;

drop policy if exists "admin read" on public.app_settings;
create policy "admin read" on public.app_settings
  for select using (public.is_admin());

drop policy if exists "admin insert" on public.app_settings;
create policy "admin insert" on public.app_settings
  for insert with check (public.admin_can('settings'));

drop policy if exists "admin update" on public.app_settings;
create policy "admin update" on public.app_settings
  for update using (public.admin_can('settings')) with check (public.admin_can('settings'));

drop policy if exists "admin delete" on public.app_settings;
create policy "admin delete" on public.app_settings
  for delete using (public.admin_can('settings'));
