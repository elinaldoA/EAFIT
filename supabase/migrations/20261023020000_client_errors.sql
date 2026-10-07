-- Erros do app capturados no navegador (exceção não tratada, promise rejeitada,
-- tela de erro do ErrorBoundary). Antes só apareciam no console de quem usava,
-- então falhas de sincronização e crashes só chegavam ao time se alguém avisasse.
--
-- Só usuário logado grava (user_id = auth.uid()), no máximo 30 por hora, com
-- tamanhos limitados. Quem lê é o admin (is_admin()). O app também deduplica e
-- limita no navegador (lib/errorReporter.js).

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('error', 'unhandledrejection', 'boundary')),
  message text not null check (length(message) between 1 and 500),
  stack text check (stack is null or length(stack) <= 2000),
  url text check (url is null or length(url) <= 300),
  app_version text check (app_version is null or length(app_version) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
create index if not exists client_errors_user_idx on public.client_errors (user_id, created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists "own insert" on public.client_errors;
create policy "own insert" on public.client_errors
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select count(*) from public.client_errors e
         where e.user_id = (select auth.uid()) and e.created_at > now() - interval '1 hour') < 30
  );

drop policy if exists "admin reads" on public.client_errors;
create policy "admin reads" on public.client_errors
  for select to authenticated using (public.is_admin());

drop policy if exists "admin deletes" on public.client_errors;
create policy "admin deletes" on public.client_errors
  for delete to authenticated using (public.is_admin());

revoke all on public.client_errors from anon, authenticated;
grant insert (user_id, kind, message, stack, url, app_version) on public.client_errors to authenticated;
grant select, delete on public.client_errors to authenticated;
