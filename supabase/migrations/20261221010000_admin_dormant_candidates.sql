-- Sumidos do app: quem está há N dias sem treinar e sem abrir o app.
--
--  * dormant_users(min_days)          — a regra, num lugar só (uso interno).
--  * admin_dormant_candidates(min_days) — tela Comunicação → Sumidos do painel:
--    lista com último treino, último acesso, canais (push/e-mail) e último
--    aviso recebido, pra disparar manualmente (admin-broadcast).
--  * regra automática 'dormant' em engagement_rules (push, criada DESLIGADA:
--    o admin liga na própria tela ou em Automáticas).
--  * admin_list_users_page: o status 'dormant' passa a ignorar conta criada há
--    menos de 7 dias (quem acabou de entrar não "sumiu").
--
-- engagement_candidates e admin_list_users_page partem da versão em produção
-- (pg_get_functiondef em 2026-10-30), só com os trechos novos.

create or replace function public.dormant_users(min_days int)
returns table (user_id uuid, last_workout date, last_seen timestamptz, days_away int)
language sql
stable
security definer
set search_path = public, auth
as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  base as (
    select u.id, u.created_at,
           (select max(t.day) from public.training_days() t where t.user_id = u.id) as last_workout,
           (select max(s.last_seen_at) from public.app_sessions s where s.user_id = u.id) as last_seen
    from auth.users u
    left join public.profiles p on p.id = u.id
    where not coalesce(p.is_admin, false)
      and (u.banned_until is null or u.banned_until <= now())
      and u.email_confirmed_at is not null
      and u.created_at < now() - make_interval(days => min_days)
  )
  select b.id, b.last_workout, b.last_seen,
         ((select d from today) - greatest(
            b.last_workout,
            (b.last_seen at time zone 'America/Sao_Paulo')::date,
            (b.created_at at time zone 'America/Sao_Paulo')::date))::int
  from base b
  where (b.last_workout is null or b.last_workout < (select d from today) - min_days)
    and (b.last_seen is null or b.last_seen < now() - make_interval(days => min_days));
$$;

revoke execute on function public.dormant_users(int) from public, anon, authenticated;
grant execute on function public.dormant_users(int) to service_role;

create or replace function public.admin_dormant_candidates(min_days int default 7)
returns table (
  user_id uuid, email text, nome text, last_workout date, last_seen timestamptz, days_away int,
  has_push boolean, email_ok boolean, paused boolean, last_notified timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today text := ((now() at time zone 'America/Sao_Paulo')::date)::text;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select d.user_id, u.email::text,
           coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'sobrenome')), ''),
                    nullif(btrim(u.raw_user_meta_data->>'apelido'), '')),
           d.last_workout, d.last_seen, d.days_away,
           exists (select 1 from public.push_subscriptions ps where ps.user_id = d.user_id),
           coalesce(u.raw_user_meta_data->>'notifyEmail', 'true') <> 'false',
           coalesce(u.raw_user_meta_data->>'pausedUntil', '') >= today,
           (select max(n.created_at) from public.user_notifications n where n.user_id = d.user_id)
    from public.dormant_users(greatest(3, least(coalesce(min_days, 7), 365))) d
    join auth.users u on u.id = d.user_id
    order by d.days_away, u.email;
end;
$$;

revoke execute on function public.admin_dormant_candidates(int) from public, anon;
grant execute on function public.admin_dormant_candidates(int) to authenticated;

insert into public.engagement_rules
  (kind, label, description, variables, enabled, priority, send_hour, weekdays, cooldown_days, title, body, title_en, body_en)
values
  ('dormant', 'Sumidos do app',
   'Para quem está de 7 a 60 dias sem treinar e sem abrir o app (conta com mais de 7 dias). No máximo uma vez por semana.',
   '{nome}, {dias}', false, 45, 18, null, 7,
   '👋 {nome}, sentimos sua falta',
   'Faz {dias} dias que você não aparece. Seu treino e a Nutrição (lembretes do café à ceia) estão te esperando. Que tal hoje?',
   '👋 {nome}, we miss you',
   'It''s been {dias} days since we last saw you. Your workout and Nutrition (meal reminders from breakfast to late-night snack) are waiting. How about today?')
on conflict (kind) do nothing;

create or replace function public.engagement_candidates(rule_kind text, ignore_hour boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, nome text, vars jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  r public.engagement_rules%rowtype;
begin
  if rule_kind not in ('protein_today', 'progress_photo', 'dormant') then
    return query select * from public.engagement_candidates_base(rule_kind, ignore_hour);
    return;
  end if;

  select * into r from public.engagement_rules er where er.kind = rule_kind;
  if not found or not r.enabled then return; end if;

  if rule_kind = 'protein_today' then
    return query
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             '{}'::jsonb
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      where (select count(*) from public.protein_logs pl
             where pl.user_id = e.uid and pl.amount_g > 0
               and pl.log_date between today - 7 and today - 1) >= 3
        and not exists (select 1 from public.protein_logs pl
                        where pl.user_id = e.uid and pl.log_date = today and pl.amount_g > 0);

  elsif rule_kind = 'progress_photo' then
    return query
      with last_photo as (
        select pp.user_id as uid, max(pp.photo_date) as last_day
        from public.progress_photos pp
        group by pp.user_id
      )
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('dias', today - lp.last_day)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join last_photo lp on lp.uid = e.uid
      where lp.last_day between today - 120 and today - 28;

  elsif rule_kind = 'dormant' then
    -- Mesma regra da tela Sumidos (admin_dormant_candidates com 7 dias), só
    -- até 60 dias sumido: depois disso o push não chega mais a quase ninguém.
    return query
      select d.user_id,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('dias', d.days_away)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join public.dormant_users(7) d on d.user_id = e.uid
      where d.days_away <= 60;
  end if;
end;
$function$;

create or replace function public.admin_list_users_page(search text DEFAULT NULL::text, status_filter text DEFAULT NULL::text, page_size integer DEFAULT 50, page_offset integer DEFAULT 0, sort_by text DEFAULT 'created_desc'::text, nivel_filter text DEFAULT NULL::text, meta_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, email_confirmed_at timestamp with time zone, banned_until timestamp with time zone, is_admin boolean, nome text, sobrenome text, apelido text, peso_alvo text, nivel text, meta text, last_training date, trainings_30d bigint, plan_end_date date, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
    with agg as (
      select t.user_id as uid, max(t.day) as last_day,
             count(*) filter (where t.day > today - 30) as t30
      from public.training_days() t
      group by t.user_id
    ),
    base as (
      select u.id, u.email::text as email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
             u.banned_until, coalesce(p.is_admin, false) as is_admin,
             u.raw_user_meta_data->>'nome' as nome,
             u.raw_user_meta_data->>'sobrenome' as sobrenome,
             u.raw_user_meta_data->>'apelido' as apelido,
             u.raw_user_meta_data->>'pesoAlvo' as peso_alvo,
             u.raw_user_meta_data->>'nivel' as nivel,
             u.raw_user_meta_data->>'meta' as meta,
             a.last_day as last_training,
             coalesce(a.t30, 0)::bigint as trainings_30d,
             (select wp.end_date from public.workout_plans wp where wp.user_id = u.id and wp.is_active limit 1) as plan_end_date
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join agg a on a.uid = u.id
      where (search is null or search = ''
             or u.email ilike '%' || search || '%'
             or (u.raw_user_meta_data->>'nome') ilike '%' || search || '%'
             or (u.raw_user_meta_data->>'sobrenome') ilike '%' || search || '%'
             or (u.raw_user_meta_data->>'apelido') ilike '%' || search || '%')
        and (nivel_filter is null or nivel_filter = '' or u.raw_user_meta_data->>'nivel' = nivel_filter)
        and (meta_filter is null or meta_filter = '' or u.raw_user_meta_data->>'meta' = meta_filter)
        and (
          status_filter is null or status_filter = ''
          or (status_filter = 'admin' and coalesce(p.is_admin, false))
          or (status_filter = 'deactivated' and public.is_deactivated(u.id))
          or (status_filter = 'banned' and u.banned_until is not null and u.banned_until > now()
              and not public.is_deactivated(u.id))
          or (status_filter = 'unconfirmed' and u.email_confirmed_at is null)
          or (status_filter = 'active' and not coalesce(p.is_admin, false)
              and (u.banned_until is null or u.banned_until <= now())
              and u.email_confirmed_at is not null)
          or (status_filter = 'inactive' and not coalesce(p.is_admin, false)
              and u.email_confirmed_at is not null
              and a.last_day is not null and a.last_day < today - 14)
          or (status_filter = 'never_trained' and not coalesce(p.is_admin, false)
              and u.email_confirmed_at is not null and a.last_day is null)
          -- sumidos: 7+ dias sem treinar (ou nunca treinou) e sem abrir o app
          or (status_filter = 'dormant' and not coalesce(p.is_admin, false)
              and (u.banned_until is null or u.banned_until <= now())
              and u.email_confirmed_at is not null
              and u.created_at < now() - interval '7 days'
              and (a.last_day is null or a.last_day < today - 7)
              and not exists (select 1 from public.app_sessions s
                              where s.user_id = u.id and s.last_seen_at >= now() - interval '7 days'))
        )
    )
    select b.*, count(*) over()::bigint as total_count
    from base b
    order by
      case when sort_by = 'created_asc' then b.created_at end asc,
      case when sort_by = 'login_desc' then b.last_sign_in_at end desc nulls last,
      case when sort_by = 'training_desc' then b.last_training end desc nulls last,
      case when sort_by = 'training_asc' then b.last_training end asc nulls first,
      case when sort_by = 'trainings_desc' then b.trainings_30d end desc,
      b.created_at desc
    limit page_size offset page_offset;
end;
$function$;
