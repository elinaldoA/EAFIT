-- Respostas prontas do personal: textos que ele reaproveita nos recados.
--
-- Mesmas regras do ambiente do personal: RLS ligado e sem policies, acesso so
-- por funcoes security definer que conferem is_trainer. Ate 20 por personal,
-- cada uma com 1 a 500 caracteres (o limite de um recado). Salvar um texto igual
-- a outro ja salvo nao duplica.

create table if not exists public.trainer_quick_replies (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists trainer_quick_replies_idx on public.trainer_quick_replies (trainer_id, created_at desc);
alter table public.trainer_quick_replies enable row level security;

create or replace function public.trainer_quick_replies()
returns table (qr_id uuid, qr_body text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  return query
    select q.id, q.body
    from public.trainer_quick_replies q
    where q.trainer_id = auth.uid()
    order by q.created_at desc
    limit 20;
end;
$$;

create or replace function public.trainer_add_quick_reply(p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  if length(v_body) not between 1 and 500 then raise exception 'invalid_body'; end if;

  select q.id into v_id from public.trainer_quick_replies q where q.trainer_id = auth.uid() and q.body = v_body limit 1;
  if v_id is not null then return v_id; end if;

  if (select count(*) from public.trainer_quick_replies q where q.trainer_id = auth.uid()) >= 20 then
    raise exception 'too_many';
  end if;

  insert into public.trainer_quick_replies (trainer_id, body) values (auth.uid(), v_body) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.trainer_delete_quick_reply(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  delete from public.trainer_quick_replies q where q.id = p_id and q.trainer_id = auth.uid();
end;
$$;

revoke execute on function public.trainer_quick_replies() from public, anon;
revoke execute on function public.trainer_add_quick_reply(text) from public, anon;
revoke execute on function public.trainer_delete_quick_reply(uuid) from public, anon;
grant execute on function public.trainer_quick_replies() to authenticated;
grant execute on function public.trainer_add_quick_reply(text) to authenticated;
grant execute on function public.trainer_delete_quick_reply(uuid) to authenticated;
