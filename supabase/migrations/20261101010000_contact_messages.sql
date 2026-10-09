-- Mensagens do formulário de contato do site (eafit.com.br/sobre/#contato).
--
-- Quem escreve não tem conta: nome, e-mail, assunto e mensagem chegam pela
-- chave anon, como as visitas e os eventos da landing. O time lê e marca como
-- respondido em Painel admin → Acompanhamento → Contato do site (a resposta em
-- si sai por e-mail, fora do sistema).
--
-- Visitante: só insere, só as colunas do formulário (o resto vem do default),
-- nunca lê. Admin: lê, muda o status e apaga. Sem RPC de propósito — o painel
-- lê a tabela direto e a RLS restringe a is_admin().
--
-- Contra abuso: os checks limitam formato e tamanho, o site manda um campo
-- isca que robô preenche (o envio nem sai) e o teto diário de
-- 20261023030000_anon_insert_daily_cap.sql recusa o que passar de 200 por dia.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  email text not null check (length(email) <= 160 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  topic text not null check (topic in ('duvida', 'suporte', 'personal', 'sugestao', 'outro')),
  message text not null check (length(btrim(message)) between 10 and 2000),
  lang text not null default 'pt' check (lang in ('pt', 'en')),
  status text not null default 'novo' check (status in ('novo', 'respondido')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;

drop policy if exists "anyone can send a contact message" on public.contact_messages;
create policy "anyone can send a contact message" on public.contact_messages
  for insert to anon, authenticated
  with check (status = 'novo' and handled_at is null);

drop policy if exists "admin reads contact messages" on public.contact_messages;
create policy "admin reads contact messages" on public.contact_messages
  for select to authenticated using (public.is_admin());

drop policy if exists "admin updates contact messages" on public.contact_messages;
create policy "admin updates contact messages" on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin deletes contact messages" on public.contact_messages;
create policy "admin deletes contact messages" on public.contact_messages
  for delete to authenticated using (public.is_admin());

revoke all on public.contact_messages from anon, authenticated;
grant insert (name, email, topic, message, lang) on public.contact_messages to anon, authenticated;
grant select, delete on public.contact_messages to authenticated;
grant update (status) on public.contact_messages to authenticated;

-- handled_at acompanha o status sozinho.
create or replace function public.contact_messages_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'respondido' and old.status <> 'respondido' then
    new.handled_at := now();
  elsif new.status <> 'respondido' then
    new.handled_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists contact_messages_touch on public.contact_messages;
create trigger contact_messages_touch
  before update on public.contact_messages
  for each row execute function public.contact_messages_touch();

drop trigger if exists contact_messages_daily_cap on public.contact_messages;
create trigger contact_messages_daily_cap
  before insert on public.contact_messages
  for each row execute function public.enforce_daily_insert_cap(200);
