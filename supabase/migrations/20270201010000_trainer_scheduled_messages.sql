-- Recados agendados do personal: ele escreve agora e escolhe quando sai.
--
-- A Edge Function send-trainer-scheduled roda de 5 em 5 minutos (pg_cron) e
-- chama trainer_dispatch_scheduled(), que no banco:
--   1. pega os agendamentos vencidos (um de cada vez, skip locked, sem
--      duplicar se duas rodadas se cruzarem);
--   2. confere os destinatarios NO MOMENTO DO ENVIO: so alunos com vinculo
--      ativo (quem saiu nesse meio tempo nao recebe; agendamento sem nenhum
--      destinatario vira 'failed');
--   3. grava os recados em trainer_messages e marca o agendamento como 'sent'.
-- A Edge Function so manda o push para quem a funcao devolveu. Se o push
-- falhar, o recado ja esta no app do aluno, como num envio normal.
--
-- Mesmas regras do ambiente do personal: RLS ligado e sem policies, acesso so
-- por funcoes security definer. Agendamento que ficou mais de 24h vencido
-- (cron parado) e descartado como 'failed' em vez de sair fora de hora.

create table if not exists public.trainer_scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_ids uuid[],                       -- nulo = todos os alunos ativos na hora do envio
  body text not null check (length(btrim(body)) between 1 and 500),
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  recipients int,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trainer_scheduled_due_idx on public.trainer_scheduled_messages (send_at) where status = 'pending';
create index if not exists trainer_scheduled_trainer_idx on public.trainer_scheduled_messages (trainer_id, status, send_at);

alter table public.trainer_scheduled_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Personal: agendar (entre 1 minuto e 60 dias a frente, ate 20 pendentes)
-- ---------------------------------------------------------------------------
create or replace function public.trainer_schedule_message(p_clients uuid[], p_body text, p_send_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_clients uuid[];
  v_id uuid;
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  if length(v_body) not between 1 and 500 then raise exception 'invalid_body'; end if;
  if p_send_at is null or p_send_at < now() + interval '1 minute' or p_send_at > now() + interval '60 days' then
    raise exception 'invalid_when';
  end if;

  if p_clients is not null and array_length(p_clients, 1) > 0 then
    -- guarda so quem e aluno ativo hoje; o envio confere de novo
    select array_agg(c.client_id) into v_clients
    from public.trainer_clients c
    where c.trainer_id = auth.uid() and c.status = 'active' and c.client_id = any(p_clients);
    if v_clients is null then raise exception 'no_recipients'; end if;
  elsif not exists (select 1 from public.trainer_clients c where c.trainer_id = auth.uid() and c.status = 'active') then
    raise exception 'no_recipients';
  end if;

  if (select count(*) from public.trainer_scheduled_messages s where s.trainer_id = auth.uid() and s.status = 'pending') >= 20 then
    raise exception 'too_many';
  end if;

  insert into public.trainer_scheduled_messages (trainer_id, client_ids, body, send_at)
  values (auth.uid(), v_clients, v_body, p_send_at)
  returning id into v_id;

  return v_id;
end;
$$;

-- Pendentes do personal, do mais proximo ao mais distante.
create or replace function public.trainer_scheduled_messages()
returns table (sm_id uuid, sm_body text, sm_at timestamptz, sm_all boolean, sm_count int, sm_names text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  return query
    select s.id, s.body, s.send_at, s.client_ids is null, coalesce(array_length(s.client_ids, 1), 0),
           (select string_agg(n.nm, ', ')
            from (
              select coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), split_part(u.email::text, '@', 1)) as nm
              from auth.users u
              where s.client_ids is not null and u.id = any(s.client_ids)
              order by 1
              limit 2
            ) n)
    from public.trainer_scheduled_messages s
    where s.trainer_id = auth.uid() and s.status = 'pending'
    order by s.send_at
    limit 50;
end;
$$;

create or replace function public.trainer_cancel_scheduled(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  update public.trainer_scheduled_messages s
     set status = 'cancelled'
   where s.id = p_id and s.trainer_id = auth.uid() and s.status = 'pending';

  if not found then raise exception 'not_found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Disparo (so service_role): grava os recados vencidos e devolve para quem
-- mandar o push.
-- ---------------------------------------------------------------------------
create or replace function public.trainer_dispatch_scheduled()
returns table (sd_id uuid, sd_trainer uuid, sd_body text, sd_clients uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_targets uuid[];
begin
  for r in
    select * from public.trainer_scheduled_messages s
    where s.status = 'pending' and s.send_at <= now()
    order by s.send_at
    limit 100
    for update skip locked
  loop
    if r.send_at < now() - interval '24 hours' then
      update public.trainer_scheduled_messages set status = 'failed', recipients = 0, sent_at = now() where id = r.id;
      continue;
    end if;

    select array_agg(c.client_id) into v_targets
    from public.trainer_clients c
    join public.trainers t on t.user_id = c.trainer_id
    where c.trainer_id = r.trainer_id and c.status = 'active'
      and (r.client_ids is null or c.client_id = any(r.client_ids));

    if v_targets is null then
      update public.trainer_scheduled_messages set status = 'failed', recipients = 0, sent_at = now() where id = r.id;
      continue;
    end if;

    insert into public.trainer_messages (trainer_id, client_id, body, kind)
    select r.trainer_id, x, btrim(r.body), 'recado' from unnest(v_targets) x;

    update public.trainer_scheduled_messages
       set status = 'sent', recipients = array_length(v_targets, 1), sent_at = now()
     where id = r.id;

    return query select r.id, r.trainer_id, btrim(r.body), v_targets;
  end loop;
end;
$$;

revoke execute on function public.trainer_schedule_message(uuid[], text, timestamptz) from public, anon;
revoke execute on function public.trainer_scheduled_messages() from public, anon;
revoke execute on function public.trainer_cancel_scheduled(uuid) from public, anon;
grant execute on function public.trainer_schedule_message(uuid[], text, timestamptz) to authenticated;
grant execute on function public.trainer_scheduled_messages() to authenticated;
grant execute on function public.trainer_cancel_scheduled(uuid) to authenticated;

revoke execute on function public.trainer_dispatch_scheduled() from public, anon, authenticated;
grant execute on function public.trainer_dispatch_scheduled() to service_role;

-- ---------------------------------------------------------------------------
-- Cron de 5 em 5 minutos. Pre-requisito: publicar a Edge Function
-- send-trainer-scheduled (Verify JWT desligado; autenticada pelo header
-- x-cron-secret, igual as outras). Sai a qualquer hora: o horario foi
-- escolhido pelo proprio personal.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'send-trainer-scheduled',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-trainer-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
