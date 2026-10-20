-- Experimentos A/B e liberação gradual (Sistema → Experimentos).
--
-- Cada pessoa cai sempre na mesma variante: o sorteio é um hash de
-- md5(chave:usuário) de 0 a 99, distribuído pelos pesos das variantes. Por
-- isso não há tabela de atribuição — o painel recalcula quem caiu onde para
-- medir os resultados.
--
-- kind 'rollout' liga uma chave de recurso (app_settings.flags) só para a
-- variante 'on': o app (lib/appConfig.js) sobrepõe a chave com o resultado de
-- my_experiments(). kind 'ab' expõe a variante para o código do app ler
-- (useExperiment), sem mexer em chave nenhuma.
--
-- Públicos iguais aos das pesquisas: todos | ativos | novos | personal |
-- academia | casa. Fora do público = sem variante (rollout: a chave fica como
-- estiver em Configurações).

create table if not exists public.experiments (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  kind text not null default 'ab' check (kind in ('ab', 'rollout')),
  flag text check (flag is null or flag ~ '^[a-z0-9_]{2,40}$'),
  variants jsonb not null default '[{"key":"a","weight":50},{"key":"b","weight":50}]'::jsonb,
  audience text not null default 'todos' check (audience in ('todos', 'ativos', 'novos', 'personal', 'academia', 'casa')),
  status text not null default 'rascunho' check (status in ('rascunho', 'rodando', 'encerrado')),
  started_at timestamptz,
  ended_at timestamptz,
  winner text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'rollout' or flag is not null),
  check (jsonb_typeof(variants) = 'array' and jsonb_array_length(variants) between 2 and 4)
);

alter table public.experiments enable row level security;

drop policy if exists "admin reads experiments" on public.experiments;
create policy "admin reads experiments" on public.experiments for select using (public.is_admin());
drop policy if exists "admin writes experiments" on public.experiments;
create policy "admin writes experiments" on public.experiments for all
  using (public.admin_can('settings')) with check (public.admin_can('settings'));

revoke all on public.experiments from anon;

-- Pesos válidos: inteiros >= 0 somando 100, chaves de variante únicas.
create or replace function public.experiments_check_variants()
returns trigger
language plpgsql
as $$
declare
  total int;
  n int;
  distinct_keys int;
begin
  select coalesce(sum((v->>'weight')::int), -1), count(*), count(distinct v->>'key')
    into total, n, distinct_keys
  from jsonb_array_elements(new.variants) v
  where v->>'key' ~ '^[a-z0-9_]{1,20}$' and (v->>'weight') ~ '^[0-9]{1,3}$';
  if total <> 100 or n <> jsonb_array_length(new.variants) or distinct_keys <> n then
    raise exception 'invalid_variants' using hint = 'pesos inteiros somando 100 e chaves únicas (a-z, 0-9, _)';
  end if;
  if new.kind = 'rollout' and not (new.variants @> '[{"key":"on"}]' and new.variants @> '[{"key":"off"}]' and n = 2) then
    raise exception 'invalid_variants' using hint = 'liberação gradual usa as variantes on e off';
  end if;
  if new.status = 'rodando' and new.started_at is null then new.started_at := now(); end if;
  if new.status = 'encerrado' and new.ended_at is null then new.ended_at := now(); end if;
  if new.status = 'rascunho' then new.started_at := null; new.ended_at := null; end if;
  return new;
end;
$$;

drop trigger if exists experiments_check_variants on public.experiments;
create trigger experiments_check_variants before insert or update on public.experiments
  for each row execute function public.experiments_check_variants();

-- A pessoa está no público? (mesmas regras das pesquisas). Uso interno.
create or replace function public.audience_match(p_audience text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = p_user
      and not coalesce(p.is_admin, false)
      and case p_audience
        when 'todos' then true
        when 'novos' then u.created_at >= now() - interval '30 days'
        when 'ativos' then exists (select 1 from public.training_days() t
                                    where t.user_id = u.id and t.day > (now() at time zone 'America/Sao_Paulo')::date - 30)
        when 'personal' then exists (select 1 from public.trainer_clients c where c.client_id = u.id and c.status = 'active')
        when 'casa' then u.raw_user_meta_data->>'local' = 'casa'
        when 'academia' then coalesce(u.raw_user_meta_data->>'local', '') <> 'casa'
        else false
      end
  );
$$;
revoke execute on function public.audience_match(text, uuid) from public, anon, authenticated;

-- 0..99, sempre igual para a mesma chave e pessoa.
create or replace function public.experiment_bucket(p_key text, p_user uuid)
returns int
language sql
immutable
as $$
  select (('x' || substr(md5(p_key || ':' || p_user::text), 1, 8))::bit(32)::bigint % 100)::int;
$$;

-- Variante pela faixa acumulada dos pesos (na ordem cadastrada).
create or replace function public.experiment_pick(p_variants jsonb, p_bucket int)
returns text
language sql
immutable
as $$
  select v.key from (
    select e->>'key' as key, sum((e->>'weight')::int) over (order by ord) as upto
    from jsonb_array_elements(p_variants) with ordinality as x(e, ord)
  ) v
  where p_bucket < v.upto
  order by v.upto
  limit 1;
$$;

-- Experimentos rodando para quem está logado: chave, variante e (rollout) a
-- chave de recurso que o app sobrepõe.
create or replace function public.my_experiments()
returns table (key text, variant text, flag text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  return query
    select e.key, public.experiment_pick(e.variants, public.experiment_bucket(e.key, auth.uid())), e.flag
    from public.experiments e
    where e.status = 'rodando' and public.audience_match(e.audience, auth.uid());
end;
$$;

revoke execute on function public.my_experiments() from public, anon;
grant execute on function public.my_experiments() to authenticated;

-- Resultado por variante, desde o início do experimento (até o fim, se
-- encerrado), entre as pessoas do público hoje:
--   xr_users        pessoas na variante
--   xr_opened       abriram o app no período
--   xr_trained      treinaram ao menos 1 dia no período
--   xr_train_days   soma de dias treinados no período
--   xr_new_users    contas criadas depois do início
--   xr_new_activated  dessas, quantas treinaram nos 7 primeiros dias
--   xr_feature_users  (rollout) usaram a funcionalidade da chave no período
-- xr_days = dias do período (para a média por semana).
create or replace function public.admin_experiment_results(p_key text)
returns table (
  xr_variant text, xr_users bigint, xr_opened bigint, xr_trained bigint, xr_train_days bigint,
  xr_new_users bigint, xr_new_activated bigint, xr_feature_users bigint, xr_days int
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  e public.experiments;
  since timestamptz;
  upto timestamptz;
  d0 date;
  d1 date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  select * into e from public.experiments where experiments.key = p_key;
  if not found or e.started_at is null then return; end if;
  since := e.started_at;
  upto := coalesce(e.ended_at, now());
  d0 := (since at time zone 'America/Sao_Paulo')::date;
  d1 := (upto at time zone 'America/Sao_Paulo')::date;

  return query
    with pop as (
      select u.id, u.created_at,
             public.experiment_pick(e.variants, public.experiment_bucket(e.key, u.id)) as variant
      from auth.users u
      where public.audience_match(e.audience, u.id)
    ),
    td as (
      select t.user_id, t.day from public.training_days() t where t.day between d0 and d1
    ),
    signup_td as (
      select t.user_id, t.day from public.training_days() t
    )
    select pop.variant,
           count(*)::bigint,
           count(*) filter (where exists (select 1 from public.app_access_days a where a.user_id = pop.id and a.day between d0 and d1))::bigint,
           count(*) filter (where exists (select 1 from td where td.user_id = pop.id))::bigint,
           coalesce(sum((select count(*) from td where td.user_id = pop.id)), 0)::bigint,
           count(*) filter (where pop.created_at >= since)::bigint,
           count(*) filter (where pop.created_at >= since and exists (
             select 1 from signup_td s where s.user_id = pop.id
               and s.day between (pop.created_at at time zone 'America/Sao_Paulo')::date
                             and (pop.created_at at time zone 'America/Sao_Paulo')::date + 6))::bigint,
           count(*) filter (where e.flag is not null and exists (
             select 1 from public.user_events ue where ue.user_id = pop.id and ue.event = 'feature'
               and ue.day between d0 and d1 and ue.detail = e.flag))::bigint,
           (d1 - d0 + 1)::int
    from pop
    group by pop.variant
    order by pop.variant;
end;
$$;

revoke execute on function public.admin_experiment_results(text) from public, anon;
grant execute on function public.admin_experiment_results(text) to authenticated;
