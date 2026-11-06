-- Cobrança do personal: o personal registra o que cada aluno deve (mensalidade,
-- avulso), dá baixa quando recebe (Pix, dinheiro... fora do app) e acompanha o
-- que está a receber, em atraso e recebido. O aluno vê as próprias cobranças
-- (somente leitura) e é avisado por push quando uma nasce.
--
-- O app NÃO movimenta dinheiro: não há gateway, chave Pix nem split. É um
-- controle manual do personal.
--
-- Como nas demais tabelas do ambiente do personal, trainer_charges tem RLS
-- ligado e NENHUMA policy: tudo passa por funções security definer que conferem
-- o vínculo ativo. Encerrado o vínculo, o aluno deixa de ver as cobranças
-- daquele personal e o personal deixa de ver as do aluno.
--
-- status: open (a receber; "em atraso" é open com due_date no passado, calculado
-- no app pelo fuso do usuário) · paid · cancelled. Valor em centavos (BRL).
-- Colunas de saída prefixadas em ch_*.

create table if not exists public.trainer_charges (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  description text not null check (length(description) between 1 and 80),
  amount_cents int not null check (amount_cents between 1 and 10000000),
  due_date date not null,
  note text check (note is null or length(note) <= 300),
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  paid_at timestamptz,
  method text check (method is null or method in ('pix', 'cash', 'card', 'transfer', 'other')),
  created_at timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null))
);

create index if not exists trainer_charges_trainer_idx on public.trainer_charges (trainer_id, status, due_date);
create index if not exists trainer_charges_client_idx on public.trainer_charges (client_id, due_date);

alter table public.trainer_charges enable row level security;

-- ---------------------------------------------------------------------------
-- Personal
-- ---------------------------------------------------------------------------

-- Cria 1 cobrança, ou p_months (até 12) mensais: a 1ª em p_due e as demais no
-- mesmo dia dos meses seguintes (dia 31 vira o último dia do mês). Com mais de
-- uma, a descrição ganha " (n/total)". Devolve quantas criou.
create or replace function public.trainer_create_charge(
  p_client uuid,
  p_description text,
  p_amount_cents int,
  p_due date,
  p_months int default 1,
  p_note text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desc text := btrim(coalesce(p_description, ''));
  v_i int;
  v_due date;
begin
  if not public.is_trainer() or not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;
  if length(v_desc) not between 1 and 80 then raise exception 'invalid_description'; end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 10000000 then raise exception 'invalid_amount'; end if;
  if p_due is null or p_due < current_date - 365 or p_due > current_date + 730 then raise exception 'invalid_due'; end if;
  if p_months is null or p_months not between 1 and 12 then raise exception 'invalid_months'; end if;
  if length(coalesce(p_note, '')) > 300 then raise exception 'invalid_text'; end if;

  if (select count(*) from public.trainer_charges c
      where c.trainer_id = auth.uid() and c.client_id = p_client and c.status = 'open') + p_months > 36 then
    raise exception 'too_many';
  end if;

  for v_i in 0 .. p_months - 1 loop
    -- soma meses a partir da data original (não da anterior) para o dia 31 não "encolher" de vez
    v_due := (p_due + make_interval(months => v_i))::date;
    insert into public.trainer_charges (trainer_id, client_id, description, amount_cents, due_date, note)
    values (
      auth.uid(), p_client,
      case when p_months > 1 then left(v_desc, 72) || ' (' || (v_i + 1) || '/' || p_months || ')' else v_desc end,
      p_amount_cents, v_due, nullif(btrim(p_note), '')
    );
  end loop;

  return p_months;
end;
$$;

-- Cobranças do personal: tudo o que está em aberto e, das pagas/canceladas, o
-- que mudou nos últimos 120 dias. p_client nulo = todos os alunos.
create or replace function public.trainer_charges(p_client uuid default null)
returns table (
  ch_id uuid, ch_client uuid, ch_name text, ch_description text, ch_amount int,
  ch_due date, ch_note text, ch_status text, ch_paid_at timestamptz, ch_method text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select c.id, c.client_id,
         coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), split_part(u.email::text, '@', 1)),
         c.description, c.amount_cents, c.due_date, c.note, c.status, c.paid_at, c.method
  from public.trainer_charges c
  join public.trainer_clients l on l.trainer_id = c.trainer_id and l.client_id = c.client_id and l.status = 'active'
  join auth.users u on u.id = c.client_id
  where c.trainer_id = auth.uid() and public.is_trainer()
    and (p_client is null or c.client_id = p_client)
    and (c.status = 'open' or coalesce(c.paid_at, c.created_at) >= now() - interval '120 days')
  order by c.due_date asc, c.created_at asc
  limit 500;
$$;

-- Dá baixa. p_paid_on = dia em que recebeu (padrão: hoje; não pode ser futuro).
create or replace function public.trainer_mark_charge_paid(p_id uuid, p_method text default 'pix', p_paid_on date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_method is null or p_method not in ('pix', 'cash', 'card', 'transfer', 'other') then raise exception 'invalid_method'; end if;
  if p_paid_on is not null and (p_paid_on > current_date + 1 or p_paid_on < current_date - 365) then raise exception 'invalid_due'; end if;

  update public.trainer_charges c
     set status = 'paid', method = p_method,
         paid_at = case when p_paid_on is null then now() else p_paid_on::timestamp at time zone 'UTC' + interval '12 hours' end
   where c.id = p_id and c.trainer_id = auth.uid() and public.is_trainer()
     and c.status = 'open' and public.is_trainer_of(c.client_id);

  if not found then raise exception 'not_found'; end if;
end;
$$;

-- Desfaz a baixa (marcou errado): volta para em aberto.
create or replace function public.trainer_reopen_charge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trainer_charges c
     set status = 'open', paid_at = null, method = null
   where c.id = p_id and c.trainer_id = auth.uid() and public.is_trainer()
     and c.status = 'paid' and public.is_trainer_of(c.client_id);

  if not found then raise exception 'not_found'; end if;
end;
$$;

-- Cancela uma cobrança em aberto (perdoada, criada por engano...).
create or replace function public.trainer_cancel_charge(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trainer_charges c
     set status = 'cancelled'
   where c.id = p_id and c.trainer_id = auth.uid() and public.is_trainer()
     and c.status = 'open' and public.is_trainer_of(c.client_id);

  if not found then raise exception 'not_found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aluno (somente leitura)
-- ---------------------------------------------------------------------------
create or replace function public.my_charges()
returns table (
  ch_id uuid, ch_trainer text, ch_description text, ch_amount int,
  ch_due date, ch_note text, ch_status text, ch_paid_at timestamptz, ch_method text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select c.id,
         coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), 'Seu personal'),
         c.description, c.amount_cents, c.due_date, c.note, c.status, c.paid_at, c.method
  from public.trainer_charges c
  join public.trainer_clients l on l.trainer_id = c.trainer_id and l.client_id = c.client_id and l.status = 'active'
  join auth.users u on u.id = c.trainer_id
  where c.client_id = auth.uid()
    and c.status <> 'cancelled'
    and (c.status = 'open' or c.paid_at >= now() - interval '12 months')
  order by (c.status = 'open') desc, c.due_date desc
  limit 60;
$$;

revoke execute on function public.trainer_create_charge(uuid, text, int, date, int, text) from public, anon;
revoke execute on function public.trainer_charges(uuid) from public, anon;
revoke execute on function public.trainer_mark_charge_paid(uuid, text, date) from public, anon;
revoke execute on function public.trainer_reopen_charge(uuid) from public, anon;
revoke execute on function public.trainer_cancel_charge(uuid) from public, anon;
revoke execute on function public.my_charges() from public, anon;
grant execute on function public.trainer_create_charge(uuid, text, int, date, int, text) to authenticated;
grant execute on function public.trainer_charges(uuid) to authenticated;
grant execute on function public.trainer_mark_charge_paid(uuid, text, date) to authenticated;
grant execute on function public.trainer_reopen_charge(uuid) to authenticated;
grant execute on function public.trainer_cancel_charge(uuid) to authenticated;
grant execute on function public.my_charges() to authenticated;
