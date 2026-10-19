-- Link de convite do personal (https://eafit.com.br/app/?personal=CODIGO):
-- todo personal liberado já tem o link (é o mesmo código de convite de
-- 20261007010000_trainer_foundation.sql). Quem abre o link e cria a conta
-- recebe no app o pedido de vínculo com aquele personal; o vínculo continua
-- nascendo do aluno, que precisa autorizar (link_trainer_invite).
--
-- Como o link é medido:
--   1. O app (lib/trainerInvite.js) guarda o código por 30 dias no navegador e
--      manda junto da visita anônima (page_visits.personal) — são os cliques.
--   2. No cadastro, o app envia o código em user_metadata.personal; o trigger
--      abaixo grava trainer_invite_signups. Código desconhecido é ignorado e o
--      cadastro nunca falha por causa disso.
--   3. Vínculo autorizado a partir do convite fica com source = 'link'.
-- O personal vê só números (trainer_invite_stats), nunca quem abriu o link.

-- ---------------------------------------------------------------------------
-- 1. Tabelas e colunas
-- ---------------------------------------------------------------------------
alter table public.trainer_clients
  add column if not exists source text not null default 'codigo';

alter table public.trainer_clients drop constraint if exists trainer_clients_source_check;
alter table public.trainer_clients add constraint trainer_clients_source_check
  check (source in ('codigo', 'link'));

create table if not exists public.trainer_invite_signups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists trainer_invite_signups_trainer_idx on public.trainer_invite_signups (trainer_id, created_at);

alter table public.trainer_invite_signups enable row level security;
revoke all on public.trainer_invite_signups from anon, authenticated;

alter table public.page_visits
  add column if not exists personal text;

alter table public.page_visits drop constraint if exists page_visits_personal_check;
alter table public.page_visits add constraint page_visits_personal_check
  check (personal is null or personal ~ '^[A-Z0-9]{4,12}$');

create index if not exists page_visits_personal_idx on public.page_visits (personal, visited_on) where personal is not null;

grant insert (page, source, os, browser, device, lang, campaign, ref, personal) on public.page_visits to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cadastro pelo link
-- ---------------------------------------------------------------------------
create or replace function public.track_trainer_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data->>'personal', '')));
  v_trainer uuid;
begin
  if v_code !~ '^[A-Z0-9]{4,12}$' then return new; end if;

  select t.user_id into v_trainer from public.trainers t where t.code = v_code;
  if v_trainer is null or v_trainer = new.id then return new; end if;

  insert into public.trainer_invite_signups (user_id, trainer_id)
  values (new.id, v_trainer)
  on conflict (user_id) do nothing;
  return new;
exception when others then
  -- Métrica nunca pode impedir alguém de criar conta.
  return new;
end;
$$;

revoke execute on function public.track_trainer_invite_on_signup() from public, anon, authenticated;

drop trigger if exists track_trainer_invite_on_signup on auth.users;
create trigger track_trainer_invite_on_signup
  after insert on auth.users
  for each row execute function public.track_trainer_invite_on_signup();

-- ---------------------------------------------------------------------------
-- 3. Convite no app
-- ---------------------------------------------------------------------------

-- Nome de quem convidou, para a tela de cadastro e o pedido de vínculo.
-- Vazio = código que não é de nenhum personal. Só o primeiro nome/apelido.
create or replace function public.trainer_invite_name(p_code text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(nullif(split_part(btrim(u.raw_user_meta_data->>'nome'), ' ', 1), ''),
                  nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), 'Seu personal')
  from public.trainers t
  join auth.users u on u.id = t.user_id
  where t.code = upper(btrim(coalesce(p_code, '')));
$$;

revoke execute on function public.trainer_invite_name(text) from public;
grant execute on function public.trainer_invite_name(text) to anon, authenticated;

-- Aluno autoriza o vínculo pelo convite: mesmas regras de link_trainer, e o
-- vínculo fica marcado como vindo do link.
create or replace function public.link_trainer_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
begin
  v_name := public.link_trainer(p_code);
  update public.trainer_clients c set source = 'link'
  where c.client_id = auth.uid() and c.status = 'active';
  return v_name;
end;
$$;

revoke execute on function public.link_trainer_invite(text) from public, anon;
grant execute on function public.link_trainer_invite(text) to authenticated;

-- Números do link do personal logado: visitas e cadastros no período e alunos
-- ativos que entraram pelo link. Quem não é personal recebe vazio.
create or replace function public.trainer_invite_stats(days_back int default 30)
returns table (iv_code text, iv_visits bigint, iv_signups bigint, iv_clients bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - (days_back - 1) end;
  v_code text;
begin
  select t.code into v_code from public.trainers t where t.user_id = auth.uid();
  if v_code is null then return; end if;

  return query
    select v_code,
      (select count(*) from public.page_visits v
         where v.personal = v_code and (since is null or v.visited_on >= since)),
      (select count(*) from public.trainer_invite_signups s
         where s.trainer_id = auth.uid()
           and (since is null or (s.created_at at time zone 'America/Sao_Paulo')::date >= since)),
      (select count(*) from public.trainer_clients c
         where c.trainer_id = auth.uid() and c.status = 'active' and c.source = 'link');
end;
$$;

revoke execute on function public.trainer_invite_stats(int) from public, anon;
grant execute on function public.trainer_invite_stats(int) to authenticated;
