-- Segmento "sumidos" no painel (Pessoas e Notificações → Enviar): 7+ dias
-- sem treinar (ou nunca treinou) e sem abrir o app no mesmo período, pra
-- disparar push e e-mail de reengajamento. Abrir o app vem de app_sessions
-- (registrado desde 2026-10-27). Mesma assinatura e corpo da versão em
-- produção (conferida com pg_get_functiondef), só com o status novo; a
-- sobrecarga antiga de 4 argumentos não é tocada.
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
