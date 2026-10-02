-- Contagem anônima de visitas à landing e à tela de acesso do app, pra saber
-- se a divulgação traz gente e por qual canal (topo do funil do painel admin).
--
-- Anônima de propósito: sem usuário, IP, user-agent ou cookie — só o dia, a
-- página e a origem. Quem grava:
--   page = 'landing' → <script> de app-react/public/landing/index.html
--   page = 'acesso'  → app-react/src/lib/pageVisits.js (tela de login/cadastro,
--                      só pra quem chega sem sessão)
-- Os dois deduplicam no navegador (no máximo 1 visita por página por dia) e
-- calculam a origem com a mesma regra (?origem=/utm_source= ou referrer),
-- duplicada nos dois lados porque a landing não tem build.
--
-- Qualquer um pode inserir (é o ponto), então os números são indicativos, não
-- à prova de spam: o check limita o formato e o painel lê agregado.

create table if not exists public.page_visits (
  id bigint generated always as identity primary key,
  visited_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  page text not null check (page in ('landing', 'acesso')),
  source text not null default 'direto' check (source ~ '^[a-z0-9_-]{1,40}$'),
  created_at timestamptz not null default now()
);

create index if not exists page_visits_visited_on_idx on public.page_visits (visited_on);

alter table public.page_visits enable row level security;

-- Só inserção pra visitantes; a data é sempre a do servidor (a policy não
-- aceita data enviada pelo cliente diferente de hoje).
drop policy if exists "anyone can record a visit" on public.page_visits;
create policy "anyone can record a visit" on public.page_visits
  for insert to anon, authenticated
  with check (visited_on = (now() at time zone 'America/Sao_Paulo')::date);

drop policy if exists "admin reads visits" on public.page_visits;
create policy "admin reads visits" on public.page_visits
  for select using (public.is_admin());

-- O Supabase concede tudo em tabela nova pra anon/authenticated por padrão:
-- aqui o visitante só pode inserir page e source (data/horário vêm do
-- servidor) e não lê nada — o painel lê via admin_visit_sources/admin_funnel.
revoke all on public.page_visits from anon, authenticated;
grant insert (page, source) on public.page_visits to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Visitas por página e origem nos últimos `days_back` dias (null/<=0 = tudo).
-- ---------------------------------------------------------------------------
create or replace function public.admin_visit_sources(days_back int default 30)
returns table (page text, source text, visits bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select v.page, v.source, count(*)::bigint
    from public.page_visits v
    where since is null or v.visited_on >= since
    group by v.page, v.source
    order by count(*) desc, v.page, v.source;
end;
$$;

grant execute on function public.admin_visit_sources(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Funil ganha a etapa de topo: visitas à tela de acesso no mesmo período
-- (quem cria conta passa por ela). Mudou o tipo de retorno → drop + create.
-- Regras das demais etapas: ver 20261002020000_admin_funnel_retention.sql.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_funnel(int);

create function public.admin_funnel(days_back int default 30)
returns table (
  visits bigint,
  signed_up bigint,
  confirmed bigint,
  onboarded bigint,
  first_workout bigint,
  second_workout_7d bigint,
  visits_since date
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  all_time boolean := days_back is null or days_back <= 0;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with cohort as (
      select u.id as uid, u.email_confirmed_at as confirmed_at, u.raw_user_meta_data as meta
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
        and (all_time or u.created_at >= now() - make_interval(days => days_back))
    ),
    td as (
      select t.user_id as uid, t.day as d
      from public.training_days() t
      join cohort c on c.uid = t.user_id
    ),
    firsts as (select td.uid, min(td.d) as first_d from td group by td.uid)
    select
      (select count(*) from public.page_visits v
         where v.page = 'acesso'
           and (all_time or v.visited_on > (now() at time zone 'America/Sao_Paulo')::date - days_back)),
      (select count(*) from cohort),
      (select count(*) from cohort where confirmed_at is not null),
      (select count(*) from cohort where coalesce(meta->>'peso', '') <> ''),
      (select count(*) from firsts),
      (select count(*) from firsts f
         where exists (select 1 from td where td.uid = f.uid and td.d > f.first_d and td.d <= f.first_d + 7)),
      (select min(v.visited_on) from public.page_visits v);
end;
$$;

grant execute on function public.admin_funnel(int) to authenticated;
