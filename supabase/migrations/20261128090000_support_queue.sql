-- Central de suporte (Acompanhamento → Central de suporte): uma fila só com o
-- feedback do app e o contato do site, com responsável, tempo de espera e os
-- erros recentes do app de quem escreveu.
--
-- O responsável fica em support_assignments (as tabelas de origem não mudam).
-- Situação normalizada: feedback usa o próprio status (novo | em_andamento |
-- resolvido); contato 'respondido' = resolvido, 'novo' com responsável =
-- em_andamento, sem responsável = novo.

create table if not exists public.support_assignments (
  source text not null check (source in ('feedback', 'contato')),
  item_id uuid not null,
  assigned_to uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (source, item_id)
);

alter table public.support_assignments enable row level security;

drop policy if exists "admin reads support assignments" on public.support_assignments;
create policy "admin reads support assignments" on public.support_assignments for select using (public.is_admin());
drop policy if exists "admin writes support assignments" on public.support_assignments;
create policy "admin writes support assignments" on public.support_assignments for all
  using (public.admin_can('users')) with check (public.admin_can('users'));

revoke all on public.support_assignments from anon;

-- Fila: p_status '' = todas; 'abertos' = novo + em_andamento; ou uma situação.
-- sq_account = conta do app de quem escreveu (contato: pelo e-mail).
-- sq_errors7 = erros do app dessa conta nos últimos 7 dias.
create or replace function public.admin_support_queue(p_status text default 'abertos', max_rows int default 300)
returns table (
  sq_source text, sq_id uuid, sq_created_at timestamptz, sq_kind text, sq_message text, sq_status text,
  sq_name text, sq_email text, sq_account uuid, sq_assigned_to uuid, sq_answered_at timestamptz,
  sq_errors7 bigint, sq_reply text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with items as (
      select 'feedback'::text as source, f.id, f.created_at, f.kind, f.message, f.status,
             coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), u.email::text) as name,
             u.email::text as email, f.user_id as account,
             coalesce(f.replied_at, f.resolved_at) as answered_at, f.admin_reply as reply
      from public.feedback f
      join auth.users u on u.id = f.user_id
      union all
      select 'contato', c.id, c.created_at, c.topic, c.message,
             case when c.status = 'respondido' then 'resolvido'
                  when exists (select 1 from public.support_assignments sa
                                where sa.source = 'contato' and sa.item_id = c.id and sa.assigned_to is not null) then 'em_andamento'
                  else 'novo' end,
             c.name, c.email,
             (select u.id from auth.users u where lower(u.email) = lower(c.email) limit 1),
             c.handled_at, null::text
      from public.contact_messages c
    )
    select i.source, i.id, i.created_at, i.kind, i.message, i.status, i.name, i.email, i.account,
           sa.assigned_to, i.answered_at,
           case when i.account is null then 0::bigint else
             (select count(*) from public.client_errors e where e.user_id = i.account and e.created_at >= now() - interval '7 days') end,
           i.reply
    from items i
    left join public.support_assignments sa on sa.source = i.source and sa.item_id = i.id
    where coalesce(p_status, '') = ''
       or (p_status = 'abertos' and i.status in ('novo', 'em_andamento'))
       or i.status = p_status
    order by (i.status = 'resolvido'), i.created_at
    limit greatest(1, least(coalesce(max_rows, 300), 1000));
end;
$$;

-- Números da fila: abertos, sem responsável e tempo até a primeira resposta
-- (mediana, em horas) dos itens criados nos últimos 30 dias.
create or replace function public.admin_support_stats()
returns table (ss_open bigint, ss_unassigned bigint, ss_old bigint, ss_answered30 bigint, ss_median_hours numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with q as (select * from public.admin_support_queue('', 1000))
    select count(*) filter (where q.sq_status <> 'resolvido'),
           count(*) filter (where q.sq_status <> 'resolvido' and q.sq_assigned_to is null),
           count(*) filter (where q.sq_status <> 'resolvido' and q.sq_created_at < now() - interval '48 hours'),
           count(*) filter (where q.sq_answered_at is not null and q.sq_created_at >= now() - interval '30 days'),
           round((percentile_cont(0.5) within group (order by extract(epoch from (q.sq_answered_at - q.sq_created_at)) / 3600)
                   filter (where q.sq_answered_at is not null and q.sq_created_at >= now() - interval '30 days'))::numeric, 1)
    from q;
end;
$$;

revoke execute on function public.admin_support_queue(text, int) from public, anon;
revoke execute on function public.admin_support_stats() from public, anon;
grant execute on function public.admin_support_queue(text, int) to authenticated;
grant execute on function public.admin_support_stats() to authenticated;
