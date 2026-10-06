-- Caixa de feedback: o usuário envia sugestão, problema ou elogio pelo Perfil
-- do app; o time acompanha numa fila no painel admin (novo -> em andamento ->
-- resolvido), com nota interna.
--
-- Usuário: só insere e lê o que é dele (no máximo 5 envios por dia, contra
-- spam). Admin: lê tudo (is_admin()), atualiza status/nota e apaga.
-- Em funções com RETURNS TABLE as colunas de saída viram variáveis plpgsql:
-- colunas de tabela são sempre qualificadas com alias.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('sugestao', 'problema', 'elogio')),
  message text not null check (length(btrim(message)) between 5 and 1000),
  context text,
  status text not null default 'novo' check (status in ('novo', 'em_andamento', 'resolvido')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "own insert" on public.feedback;
create policy "own insert" on public.feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'novo'
    and admin_note is null
    and (select count(*) from public.feedback f
         where f.user_id = auth.uid() and f.created_at > now() - interval '1 day') < 5
  );

drop policy if exists "own read" on public.feedback;
create policy "own read" on public.feedback
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "admin read" on public.feedback;
create policy "admin read" on public.feedback
  for select to authenticated using (public.is_admin());

drop policy if exists "admin update" on public.feedback;
create policy "admin update" on public.feedback
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin delete" on public.feedback;
create policy "admin delete" on public.feedback
  for delete to authenticated using (public.is_admin());

-- updated_at/resolved_at acompanham a mudança de status sozinhos.
create or replace function public.feedback_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'resolvido' and old.status <> 'resolvido' then
    new.resolved_at := now();
  elsif new.status <> 'resolvido' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_touch on public.feedback;
create trigger feedback_touch
  before update on public.feedback
  for each row execute function public.feedback_touch();

-- ---------------------------------------------------------------------------
-- Fila do painel: feedback + quem enviou, com filtros e paginação.
-- novos = total de feedbacks novos (independe do filtro), pro aviso do menu.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_feedback(
  status_filter text default null,
  kind_filter text default null,
  page_size int default 50,
  page_offset int default 0
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  nome text,
  apelido text,
  kind text,
  message text,
  context text,
  status text,
  admin_note text,
  created_at timestamptz,
  resolved_at timestamptz,
  total_count bigint,
  novos bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select f.id, f.user_id, u.email::text, u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'apelido',
           f.kind, f.message, f.context, f.status, f.admin_note, f.created_at, f.resolved_at,
           count(*) over()::bigint,
           (select count(*) from public.feedback n where n.status = 'novo')
    from public.feedback f
    join auth.users u on u.id = f.user_id
    where (status_filter is null or status_filter = '' or f.status = status_filter)
      and (kind_filter is null or kind_filter = '' or f.kind = kind_filter)
    order by (f.status = 'resolvido'), f.created_at desc
    limit page_size offset page_offset;
end;
$$;

grant execute on function public.admin_list_feedback(text, text, int, int) to authenticated;
