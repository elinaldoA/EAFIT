-- Alertas push e resumo semanal para o personal.
--
-- A Edge Function send-trainer-alerts roda de hora em hora (pg_cron) e pergunta
-- ao banco o que deve ser avisado:
--   • trainer_alert_candidates(): aluno sem treinar há N dias, recorde de
--     carga e relato de dor forte/lesão — cada alerta só uma vez (trainer_alert_log).
--   • trainer_weekly_candidates(): resumo da semana anterior, na segunda.
-- O personal liga/desliga cada tipo e escolhe o prazo de "sem treinar" em
-- trainer_settings (padrão: tudo ligado, 7 dias).
--
-- As funções de candidatos são só do service_role (a Edge Function); o personal
-- lê/grava só as próprias configurações. Em funções com RETURNS TABLE as
-- colunas de saída têm prefixo (al_*, wk_*, s_*) pra não colidir com colunas.

create table if not exists public.trainer_settings (
  trainer_id uuid primary key references auth.users(id) on delete cascade,
  alert_inactive boolean not null default true,
  alert_pr boolean not null default true,
  alert_pain boolean not null default true,
  weekly_summary boolean not null default true,
  inactive_days int not null default 7 check (inactive_days between 3 and 30),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_alert_log (
  id bigint generated always as identity primary key,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('inactive', 'pr', 'pain', 'weekly')),
  ref text not null,
  created_at timestamptz not null default now(),
  unique (trainer_id, client_id, kind, ref)
);

alter table public.trainer_settings enable row level security;
alter table public.trainer_alert_log enable row level security;

-- ---------------------------------------------------------------------------
-- Configurações do personal
-- ---------------------------------------------------------------------------
create or replace function public.trainer_get_settings()
returns table (s_inactive boolean, s_pr boolean, s_pain boolean, s_weekly boolean, s_days int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  return query
    select coalesce(t.alert_inactive, true), coalesce(t.alert_pr, true), coalesce(t.alert_pain, true),
           coalesce(t.weekly_summary, true), coalesce(t.inactive_days, 7)
    from (select 1) x
    left join public.trainer_settings t on t.trainer_id = auth.uid();
end;
$$;

create or replace function public.trainer_set_settings(
  p_inactive boolean, p_pr boolean, p_pain boolean, p_weekly boolean, p_days int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  if p_days is null or p_days not between 3 and 30 then raise exception 'invalid_settings'; end if;

  insert into public.trainer_settings (trainer_id, alert_inactive, alert_pr, alert_pain, weekly_summary, inactive_days, updated_at)
  values (auth.uid(), coalesce(p_inactive, true), coalesce(p_pr, true), coalesce(p_pain, true), coalesce(p_weekly, true), p_days, now())
  on conflict (trainer_id) do update
    set alert_inactive = excluded.alert_inactive, alert_pr = excluded.alert_pr, alert_pain = excluded.alert_pain,
        weekly_summary = excluded.weekly_summary, inactive_days = excluded.inactive_days, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Alertas pendentes (ainda não avisados). Só service_role.
--   inactive: dias desde o último treino (ou desde o vínculo, se nunca treinou)
--             >= prazo do personal e aluno fora do modo pausa. ref = data de
--             referência, então um novo "sumiço" depois de voltar a treinar
--             gera novo alerta.
--   pr:       carga máxima de hoje/ontem maior que todo o histórico anterior
--             do mesmo exercício (a 1ª vez que faz o exercício não conta).
--   pain:     desconforto 'forte' ou 'lesao' registrado nas últimas 36h.
-- ---------------------------------------------------------------------------
create or replace function public.trainer_alert_candidates()
returns table (al_trainer uuid, al_client uuid, al_name text, al_kind text, al_ref text, al_detail text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  return query
  with links as (
    select c.trainer_id as trainer_id, c.client_id as client_id,
           (c.linked_at at time zone 'America/Sao_Paulo')::date as linked_day,
           coalesce(s.alert_inactive, true) as a_inactive,
           coalesce(s.alert_pr, true) as a_pr,
           coalesce(s.alert_pain, true) as a_pain,
           coalesce(s.inactive_days, 7) as idays
    from public.trainer_clients c
    join public.trainers t on t.user_id = c.trainer_id
    left join public.trainer_settings s on s.trainer_id = c.trainer_id
    where c.status = 'active'
  ),
  people as (
    select l.client_id as client_id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), nullif(btrim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email::text, '@', 1)) as nm,
           coalesce(u.raw_user_meta_data->>'pausedUntil', '') >= today::text as paused
    from (select distinct k.client_id from links k) l
    join auth.users u on u.id = l.client_id
  ),
  lastday as (
    select d.user_id as client_id, max(d.day) as ld
    from public.training_days() d
    where d.user_id in (select k.client_id from links k)
    group by d.user_id
  ),
  inactive as (
    select l.trainer_id, l.client_id, p.nm,
           coalesce(ld.ld, l.linked_day) as ref_day,
           today - coalesce(ld.ld, l.linked_day) as gap
    from links l
    join people p on p.client_id = l.client_id
    left join lastday ld on ld.client_id = l.client_id
    where l.a_inactive and not p.paused
      and today - coalesce(ld.ld, l.linked_day) >= l.idays
  ),
  recent as (
    select w.user_id as client_id, es.exercise_name as ex, max(es.carga) as m
    from public.exercise_sets es
    join public.workouts w on w.id = es.workout_id
    where w.user_id in (select k.client_id from links k)
      and es.completed and es.carga > 0 and w.workout_date >= today - 1
    group by w.user_id, es.exercise_name
  ),
  prior as (
    select w.user_id as client_id, es.exercise_name as ex, max(es.carga) as m
    from public.exercise_sets es
    join public.workouts w on w.id = es.workout_id
    where w.user_id in (select k.client_id from links k)
      and es.completed and es.carga > 0 and w.workout_date < today - 1
    group by w.user_id, es.exercise_name
  ),
  prs as (
    select r.client_id, r.ex, r.m
    from recent r
    join prior pr on pr.client_id = r.client_id and pr.ex = r.ex
    where r.m > pr.m
  ),
  pain as (
    select x.user_id as client_id, x.id::text as ref, x.exercise_name as ex, x.severity as sev
    from public.exercise_discomfort x
    where x.user_id in (select k.client_id from links k)
      and x.severity in ('forte', 'lesao')
      and x.created_at > now() - interval '36 hours'
  ),
  alerts as (
    select i.trainer_id, i.client_id, i.nm, 'inactive'::text as kind, i.ref_day::text as ref,
           ('há ' || i.gap || ' dias') as detail
    from inactive i
    union all
    select l.trainer_id, g.client_id, p.nm, 'pr'::text, (g.ex || ':' || g.m::text),
           (g.ex || ' ' || regexp_replace(g.m::text, '\.0+$', '') || ' kg')
    from prs g
    join links l on l.client_id = g.client_id and l.a_pr
    join people p on p.client_id = g.client_id
    union all
    select l.trainer_id, n.client_id, p.nm, 'pain'::text, n.ref,
           (n.ex || ' (' || case n.sev when 'lesao' then 'lesão' else 'dor forte' end || ')')
    from pain n
    join links l on l.client_id = n.client_id and l.a_pain
    join people p on p.client_id = n.client_id
  )
  select a.trainer_id, a.client_id, a.nm, a.kind, a.ref, a.detail
  from alerts a
  where not exists (
    select 1 from public.trainer_alert_log g
    where g.trainer_id = a.trainer_id and g.client_id = a.client_id and g.kind = a.kind and g.ref = a.ref
  )
  order by a.trainer_id, a.kind, a.nm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resumo da semana anterior (7 dias até ontem), um por personal com ao menos
-- um aluno ativo e resumo ligado. ref = segunda-feira da semana corrente.
-- ---------------------------------------------------------------------------
create or replace function public.trainer_weekly_candidates()
returns table (wk_trainer uuid, wk_ref text, wk_clients int, wk_active int, wk_sessions int, wk_inactive int, wk_top text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  monday date := ((now() at time zone 'America/Sao_Paulo')::date) - (extract(isodow from (now() at time zone 'America/Sao_Paulo')::date)::int - 1);
begin
  return query
  with links as (
    select c.trainer_id as trainer_id, c.client_id as client_id
    from public.trainer_clients c
    join public.trainers t on t.user_id = c.trainer_id
    left join public.trainer_settings s on s.trainer_id = c.trainer_id
    where c.status = 'active' and coalesce(s.weekly_summary, true)
  ),
  per_client as (
    select l.trainer_id, l.client_id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), nullif(btrim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email::text, '@', 1)) as nm,
           (select count(*) from public.training_days() d
            where d.user_id = l.client_id and d.day between today - 7 and today - 1)::int as days
    from links l
    join auth.users u on u.id = l.client_id
  ),
  agg as (
    select pc.trainer_id,
           count(*)::int as clients,
           count(*) filter (where pc.days > 0)::int as active,
           coalesce(sum(pc.days), 0)::int as sessions,
           count(*) filter (where pc.days = 0)::int as inactive
    from per_client pc
    group by pc.trainer_id
  )
  select a.trainer_id, monday::text, a.clients, a.active, a.sessions, a.inactive,
         (select t.nm || ' (' || t.days || ' dias)'
          from per_client t where t.trainer_id = a.trainer_id and t.days > 0
          order by t.days desc, t.nm limit 1)
  from agg a
  where not exists (
    select 1 from public.trainer_alert_log g
    where g.trainer_id = a.trainer_id and g.client_id = a.trainer_id and g.kind = 'weekly' and g.ref = monday::text
  );
end;
$$;

revoke execute on function public.trainer_get_settings() from public, anon;
revoke execute on function public.trainer_set_settings(boolean, boolean, boolean, boolean, int) from public, anon;
grant execute on function public.trainer_get_settings() to authenticated;
grant execute on function public.trainer_set_settings(boolean, boolean, boolean, boolean, int) to authenticated;

revoke execute on function public.trainer_alert_candidates() from public, anon, authenticated;
revoke execute on function public.trainer_weekly_candidates() from public, anon, authenticated;
grant execute on function public.trainer_alert_candidates() to service_role;
grant execute on function public.trainer_weekly_candidates() to service_role;

-- ---------------------------------------------------------------------------
-- Cron de hora em hora (minuto 0). Pré-requisito: publicar a Edge Function
-- send-trainer-alerts (Verify JWT desligado; autenticada pelo header
-- x-cron-secret, igual às outras). Dentro da função só se avisa entre 8h e
-- 20h de Brasília, e o resumo semanal sai na segunda às 8h.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'send-trainer-alerts-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-trainer-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
