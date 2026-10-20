-- Pedidos de titulares (LGPD) — Sistema → Pedidos LGPD. Registro do pedido
-- com prazo (15 dias, art. 19, II), situação e notas. O arquivo de acesso ou
-- portabilidade e a exclusão continuam na ficha do usuário (Ações), que já
-- fazem isso com os critérios definidos lá (app-admin/src/lib/userExport.js).

create table if not exists public.privacy_requests (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  email text not null check (char_length(email) between 3 and 160),
  kind text not null check (kind in ('acesso', 'portabilidade', 'correcao', 'exclusao', 'revogacao', 'outro')),
  status text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'concluido', 'recusado')),
  channel text not null default 'email' check (channel in ('email', 'app', 'site', 'outro')),
  received_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '15 days',
  notes text not null default '' check (char_length(notes) <= 2000),
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists privacy_requests_status_idx on public.privacy_requests (status, due_at);

alter table public.privacy_requests enable row level security;
drop policy if exists "admin reads privacy requests" on public.privacy_requests;
create policy "admin reads privacy requests" on public.privacy_requests for select using (public.is_admin());
drop policy if exists "admin writes privacy requests" on public.privacy_requests;
create policy "admin writes privacy requests" on public.privacy_requests for all
  using (public.admin_can('users')) with check (public.admin_can('users'));
revoke all on public.privacy_requests from anon;

create or replace function public.privacy_requests_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status in ('concluido', 'recusado') and new.resolved_at is null then new.resolved_at := now(); end if;
  if new.status in ('aberto', 'em_andamento') then new.resolved_at := null; end if;
  return new;
end;
$$;

drop trigger if exists privacy_requests_touch on public.privacy_requests;
create trigger privacy_requests_touch before insert or update on public.privacy_requests
  for each row execute function public.privacy_requests_touch();

-- Busca a conta pelo e-mail (para ligar o pedido à pessoa).
create or replace function public.admin_find_user_by_email(p_email text)
returns table (fu_user uuid, fu_name text, fu_created timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
    select u.id, coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), u.email::text), u.created_at
    from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
end;
$$;

revoke execute on function public.admin_find_user_by_email(text) from public, anon;
grant execute on function public.admin_find_user_by_email(text) to authenticated;
