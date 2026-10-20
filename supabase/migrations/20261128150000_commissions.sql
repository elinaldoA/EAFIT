-- Comissões dos parceiros (Pessoas → Comissões). Paga por cadastro ativado:
-- conta vinculada pelo link do embaixador/influenciador (ambassador_referrals)
-- no mês, que treinou nos 7 primeiros dias. O valor é definido no painel por
-- tipo (commission_rules) e pode ter exceção por parceiro
-- (commission_overrides). Sem valor definido = R$ 0.
--
-- commission_payouts guarda o fechamento de cada mês por parceiro: o valor
-- calculado na hora de fechar, a situação (pendente | pago | contestado) e notas.

create table if not exists public.commission_rules (
  kind text primary key check (kind in ('embaixador', 'influenciador')),
  per_activated numeric not null default 0 check (per_activated >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.commission_rules (kind) values ('embaixador'), ('influenciador') on conflict do nothing;

create table if not exists public.commission_overrides (
  ambassador_id uuid primary key references public.ambassadors(id) on delete cascade,
  per_activated numeric not null check (per_activated >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.commission_payouts (
  ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  activated int not null default 0,
  amount numeric not null default 0 check (amount >= 0),
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'contestado')),
  paid_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (ambassador_id, month)
);

alter table public.commission_rules enable row level security;
alter table public.commission_overrides enable row level security;
alter table public.commission_payouts enable row level security;
do $$
declare t text;
begin
  foreach t in array array['commission_rules', 'commission_overrides', 'commission_payouts'] loop
    execute format('drop policy if exists "admin reads %1$s" on public.%1$s', t);
    execute format('create policy "admin reads %1$s" on public.%1$s for select using (public.is_admin())', t);
    execute format('drop policy if exists "admin writes %1$s" on public.%1$s', t);
    execute format('create policy "admin writes %1$s" on public.%1$s for all using (public.admin_can(''users'')) with check (public.admin_can(''users''))', t);
    execute format('revoke all on public.%1$s from anon', t);
  end loop;
end $$;

-- Extrato do mês (YYYY-MM, horário de Brasília) por parceiro ativo ou com
-- indicação no mês: indicações, quantas ativaram, valor por ativado (exceção
-- ou regra do tipo), total calculado e o fechamento, se houver.
create or replace function public.admin_commission_statement(p_month text)
returns table (
  cs_ambassador uuid, cs_name text, cs_kind text, cs_code text, cs_user uuid, cs_active boolean,
  cs_referrals bigint, cs_activated bigint, cs_rate numeric, cs_amount numeric, cs_override boolean,
  cs_payout_amount numeric, cs_payout_status text, cs_paid_at timestamptz, cs_notes text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  m0 date;
  m1 date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid_month'; end if;
  m0 := (p_month || '-01')::date;
  m1 := (m0 + interval '1 month')::date;

  return query
    with refs as (
      select r.ambassador_id, r.user_id, (u.created_at at time zone 'America/Sao_Paulo')::date as joined
      from public.ambassador_referrals r
      join auth.users u on u.id = r.user_id
      where (r.linked_at at time zone 'America/Sao_Paulo')::date >= m0
        and (r.linked_at at time zone 'America/Sao_Paulo')::date < m1
    ),
    td as (
      select t.user_id, t.day from public.training_days() t where t.user_id in (select user_id from refs)
    ),
    agg as (
      select refs.ambassador_id, count(*) as referrals,
             count(*) filter (where exists (select 1 from td where td.user_id = refs.user_id and td.day between refs.joined and refs.joined + 6)) as activated
      from refs group by refs.ambassador_id
    )
    select a.id, a.name, a.kind, a.code, a.user_id, a.active,
           coalesce(agg.referrals, 0)::bigint, coalesce(agg.activated, 0)::bigint,
           coalesce(o.per_activated, cr.per_activated, 0),
           coalesce(agg.activated, 0) * coalesce(o.per_activated, cr.per_activated, 0),
           o.ambassador_id is not null,
           p.amount, p.status, p.paid_at, p.notes
    from public.ambassadors a
    left join agg on agg.ambassador_id = a.id
    left join public.commission_rules cr on cr.kind = a.kind
    left join public.commission_overrides o on o.ambassador_id = a.id
    left join public.commission_payouts p on p.ambassador_id = a.id and p.month = p_month
    where a.active or agg.referrals > 0 or p.ambassador_id is not null
    order by coalesce(agg.activated, 0) desc, a.name;
end;
$$;

revoke execute on function public.admin_commission_statement(text) from public, anon;
grant execute on function public.admin_commission_statement(text) to authenticated;
