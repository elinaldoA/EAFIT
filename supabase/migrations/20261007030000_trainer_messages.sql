-- Recados do personal para os alunos (com push, enviado pela Edge Function
-- trainer-push). Sem chat: o personal manda, o aluno lê no app.
--
-- Como nas demais tabelas do ambiente do personal, trainer_messages tem RLS
-- ligado e NENHUMA policy: tudo passa por funções security definer, que
-- conferem o vínculo ativo. Um recado enviado a um aluno só é visível a ele e
-- ao personal que enviou; se o vínculo é encerrado, o aluno deixa de ver o
-- histórico daquele personal.
--
-- As funções de leitura são `language sql` com colunas de saída prefixadas
-- (msg_*) pra não colidir com colunas das tabelas.

create table if not exists public.trainer_messages (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 500),
  kind text not null default 'recado' check (kind in ('recado', 'treino')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists trainer_messages_client_idx on public.trainer_messages (client_id, created_at desc);
create index if not exists trainer_messages_trainer_idx on public.trainer_messages (trainer_id, created_at desc);

alter table public.trainer_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Enviar: p_clients nulo = todos os alunos ativos. Devolve os ids que
-- receberam (a Edge Function usa a mesma lista pra mandar o push). Até 200
-- mensagens por dia por personal, contra abuso.
-- ---------------------------------------------------------------------------
create or replace function public.trainer_send_message(
  p_clients uuid[],
  p_body text,
  p_kind text default 'recado'
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_targets uuid[];
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 500 then raise exception 'invalid_body'; end if;
  if p_kind not in ('recado', 'treino') then raise exception 'invalid_kind'; end if;

  select array_agg(c.client_id) into v_targets
  from public.trainer_clients c
  where c.trainer_id = uid and c.status = 'active'
    and (p_clients is null or c.client_id = any(p_clients));

  if v_targets is null then raise exception 'no_recipients'; end if;

  if (select count(*) from public.trainer_messages m
      where m.trainer_id = uid and m.created_at > now() - interval '1 day') + array_length(v_targets, 1) > 200 then
    raise exception 'rate_limited';
  end if;

  insert into public.trainer_messages (trainer_id, client_id, body, kind)
  select uid, t, btrim(p_body), p_kind from unnest(v_targets) t;

  return v_targets;
end;
$$;

-- Histórico enviado pelo personal (uma linha por aluno; o app agrupa).
create or replace function public.trainer_sent_messages(p_limit int default 80)
returns table (
  msg_id uuid, msg_client uuid, msg_name text, msg_body text, msg_kind text, msg_at timestamptz, msg_read timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select m.id, m.client_id,
         coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), split_part(u.email::text, '@', 1)),
         m.body, m.kind, m.created_at, m.read_at
  from public.trainer_messages m
  join auth.users u on u.id = m.client_id
  where m.trainer_id = auth.uid() and public.is_trainer()
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

-- Recados recebidos pelo aluno, só do personal com vínculo ativo.
create or replace function public.my_messages(p_limit int default 20)
returns table (
  msg_id uuid, msg_trainer text, msg_body text, msg_kind text, msg_at timestamptz, msg_read timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select m.id,
         coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), 'Seu personal'),
         m.body, m.kind, m.created_at, m.read_at
  from public.trainer_messages m
  join public.trainer_clients c on c.trainer_id = m.trainer_id and c.client_id = m.client_id and c.status = 'active'
  join auth.users u on u.id = m.trainer_id
  where m.client_id = auth.uid()
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.mark_messages_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.trainer_messages m set read_at = now()
  where m.client_id = auth.uid() and m.read_at is null;
$$;

revoke execute on function public.trainer_send_message(uuid[], text, text) from public, anon;
revoke execute on function public.trainer_sent_messages(int) from public, anon;
revoke execute on function public.my_messages(int) from public, anon;
revoke execute on function public.mark_messages_read() from public, anon;
grant execute on function public.trainer_send_message(uuid[], text, text) to authenticated;
grant execute on function public.trainer_sent_messages(int) to authenticated;
grant execute on function public.my_messages(int) to authenticated;
grant execute on function public.mark_messages_read() to authenticated;
