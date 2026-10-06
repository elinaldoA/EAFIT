-- Central de avisos dentro do app (sino na barra superior): guarda o que o
-- admin enviou (notificação em massa/agendada) e as notificações automáticas
-- de engajamento, para o aluno ler mesmo sem push ativo ou depois de ter
-- perdido a notificação.
--
-- Só o backend grava (Edge Functions com service role, que ignora RLS). O
-- aluno lê as próprias linhas e marca como lidas pela RPC.
create table if not exists public.user_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'aviso',
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists user_notifications_user_idx
  on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "read own" on public.user_notifications;
create policy "read own" on public.user_notifications
  for select using (user_id = auth.uid());

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;

revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;
