-- Resposta do aluno aos recados do personal: vira uma conversa por vínculo.
--
-- Reaproveita trainer_messages com a coluna `sender`. As funções que já
-- existiam (recados do personal -> aluno) passam a olhar só sender = 'trainer',
-- então a faixa de recados, a bolinha e o "lido" do personal seguem iguais.
-- Respostas do aluno: ficam visíveis só ao aluno e ao personal com vínculo
-- ativo; encerrado o vínculo, o histórico some pros dois lados.
--
-- `read_at` sempre significa "lido pelo destinatário": nas respostas, é o
-- personal que lê.

alter table public.trainer_messages
  add column if not exists sender text not null default 'trainer' check (sender in ('trainer', 'client'));

-- ---------------------------------------------------------------------------
-- Já existentes: restringem ao que o personal enviou (mesmas assinaturas).
-- ---------------------------------------------------------------------------
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
  where m.trainer_id = auth.uid() and public.is_trainer() and m.sender = 'trainer'
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

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
  where m.client_id = auth.uid() and m.sender = 'trainer'
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
  where m.client_id = auth.uid() and m.sender = 'trainer' and m.read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Aluno responde ao personal do vínculo ativo. Devolve o id do personal.
-- Até 60 respostas por dia, contra abuso.
-- ---------------------------------------------------------------------------
create or replace function public.client_send_reply(p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_trainer uuid;
begin
  if uid is null then raise exception 'not_authorized'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 500 then raise exception 'invalid_body'; end if;

  select c.trainer_id into v_trainer
  from public.trainer_clients c
  where c.client_id = uid and c.status = 'active';
  if v_trainer is null then raise exception 'no_trainer'; end if;

  if (select count(*) from public.trainer_messages m
      where m.client_id = uid and m.sender = 'client' and m.created_at > now() - interval '1 day') >= 60 then
    raise exception 'rate_limited';
  end if;

  insert into public.trainer_messages (trainer_id, client_id, body, kind, sender)
  values (v_trainer, uid, btrim(p_body), 'recado', 'client');

  return v_trainer;
end;
$$;

-- Conversa vista pelo aluno (os dois lados, só do personal ativo), em ordem
-- cronológica.
create or replace function public.my_thread(p_limit int default 40)
returns table (th_id uuid, th_from text, th_body text, th_kind text, th_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select m.id, m.sender, m.body, m.kind, m.created_at
    from public.trainer_messages m
    join public.trainer_clients c on c.trainer_id = m.trainer_id and c.client_id = m.client_id and c.status = 'active'
    where m.client_id = auth.uid()
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 100)
  ) t order by t.created_at asc;
$$;

-- Conversa vista pelo personal com um aluno dele.
create or replace function public.trainer_thread(p_client uuid, p_limit int default 40)
returns table (th_id uuid, th_from text, th_body text, th_kind text, th_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select m.id, m.sender, m.body, m.kind, m.created_at
    from public.trainer_messages m
    where m.trainer_id = auth.uid() and m.client_id = p_client
      and public.is_trainer() and public.is_trainer_of(p_client)
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 100)
  ) t order by t.created_at asc;
$$;

-- O personal abriu a conversa: marca as respostas daquele aluno como lidas.
create or replace function public.trainer_mark_thread_read(p_client uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.trainer_messages m set read_at = now()
  where m.trainer_id = auth.uid() and m.client_id = p_client
    and m.sender = 'client' and m.read_at is null
    and public.is_trainer() and public.is_trainer_of(p_client);
$$;

-- Respostas ainda não lidas, por aluno (bolinha na lista de alunos).
create or replace function public.trainer_unread_replies()
returns table (ur_client uuid, ur_count int)
language sql
stable
security definer
set search_path = public
as $$
  select m.client_id, count(*)::int
  from public.trainer_messages m
  join public.trainer_clients c on c.trainer_id = m.trainer_id and c.client_id = m.client_id and c.status = 'active'
  where m.trainer_id = auth.uid() and public.is_trainer()
    and m.sender = 'client' and m.read_at is null
  group by m.client_id;
$$;

revoke execute on function public.client_send_reply(text) from public, anon;
revoke execute on function public.my_thread(int) from public, anon;
revoke execute on function public.trainer_thread(uuid, int) from public, anon;
revoke execute on function public.trainer_mark_thread_read(uuid) from public, anon;
revoke execute on function public.trainer_unread_replies() from public, anon;
grant execute on function public.client_send_reply(text) to authenticated;
grant execute on function public.my_thread(int) to authenticated;
grant execute on function public.trainer_thread(uuid, int) to authenticated;
grant execute on function public.trainer_mark_thread_read(uuid) to authenticated;
grant execute on function public.trainer_unread_replies() to authenticated;
