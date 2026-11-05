-- O EAFIT saiu do Threads: o painel de marketing não conecta, não publica e não
-- mede mais nada lá. Remove as contas do Threads (tokens, alvos de posts,
-- métricas e comentários saem junto, em cascata), tira 'threads' das redes
-- aceitas e refaz as funções que ainda citavam o Threads: criar post (a regra
-- "story não vai ao Threads"), publicação automática e os relatórios de
-- cadastros por rede e por post. Visitas e cadastros antigos que vieram do
-- Threads continuam no banco, só deixam de aparecer nos relatórios.

delete from public.marketing_accounts where platform = 'threads';

alter table public.marketing_accounts drop constraint if exists marketing_accounts_platform_check;
alter table public.marketing_accounts add constraint marketing_accounts_platform_check
  check (platform in ('facebook', 'instagram', 'tiktok'));

CREATE OR REPLACE FUNCTION public.marketing_create_post(p_caption text, p_media jsonb, p_accounts uuid[], p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_format text DEFAULT 'feed'::text, p_tiktok jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_format text := coalesce(p_format, 'feed');
  v_tiktok boolean;
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  if coalesce(cardinality(p_accounts), 0) = 0 then raise exception 'no_accounts'; end if;
  if v_format not in ('feed', 'story') then raise exception 'invalid_format'; end if;
  if coalesce(btrim(p_caption), '') = '' and coalesce(jsonb_array_length(p_media), 0) = 0 then raise exception 'empty_post'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) m
    where m ->> 'type' not in ('image', 'video') or coalesce(m ->> 'url', '') !~ '^https://'
  ) then raise exception 'invalid_media'; end if;
  if (select count(*) from public.marketing_accounts where id = any(p_accounts)) <> cardinality(p_accounts) then
    raise exception 'unknown_account';
  end if;
  if v_format = 'story' then
    if coalesce(jsonb_array_length(p_media), 0) <> 1 then raise exception 'story_needs_one_media'; end if;
  end if;

  v_tiktok := exists (select 1 from public.marketing_accounts where id = any(p_accounts) and platform = 'tiktok');
  if v_tiktok then
    if coalesce(p_tiktok ->> 'privacy_level', '') not in ('PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY') then
      raise exception 'tiktok_privacy_required';
    end if;
    if (p_tiktok ->> 'brand_content')::boolean is true and p_tiktok ->> 'privacy_level' = 'SELF_ONLY' then
      raise exception 'tiktok_branded_cannot_be_private';
    end if;
  end if;

  insert into public.marketing_posts (caption, media, scheduled_at, created_by, format, tiktok)
  values (
    case when v_format = 'story' then '' else coalesce(p_caption, '') end, coalesce(p_media, '[]'::jsonb), p_scheduled_at, auth.uid(), v_format,
    case when v_tiktok then jsonb_build_object(
      'privacy_level', p_tiktok ->> 'privacy_level',
      'allow_comment', coalesce((p_tiktok ->> 'allow_comment')::boolean, false),
      'allow_duet', coalesce((p_tiktok ->> 'allow_duet')::boolean, false),
      'allow_stitch', coalesce((p_tiktok ->> 'allow_stitch')::boolean, false),
      'brand_organic', coalesce((p_tiktok ->> 'brand_organic')::boolean, false),
      'brand_content', coalesce((p_tiktok ->> 'brand_content')::boolean, false)
    ) end
  )
  returning id into v_id;

  insert into public.marketing_post_targets (post_id, account_id, run_after)
  select v_id, a, coalesce(greatest(p_scheduled_at, now()), now()) from unnest(p_accounts) a;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingPost', jsonb_build_object(
    'post', v_id, 'accounts', cardinality(p_accounts), 'scheduled_at', p_scheduled_at, 'format', v_format,
    'caption', left(p_caption, 200)
  ));
  return v_id;
end;
$function$;

create or replace function public.marketing_autopost_run(p_format text, p_slot text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.marketing_autopost_queue;
  v_accounts uuid[];
  v_post uuid;
  v_season text := public.marketing_active_season();
begin
  if not coalesce((select enabled from public.marketing_autopost_settings where id), false) then return null; end if;

  select array_agg(id) into v_accounts from public.marketing_accounts
  where status = 'ok' and platform in ('instagram', 'facebook');
  if coalesce(cardinality(v_accounts), 0) = 0 then return null; end if;

  loop
    -- Item da temporada no ar primeiro; item de outra temporada espera.
    select * into v_item from public.marketing_autopost_queue
    where posted_at is null and skipped_at is null and format = p_format and slot is not distinct from p_slot
      and (season is null or season = v_season)
    order by (season is not null) desc, position
    limit 1
    for update skip locked;
    if not found then return null; end if;

    -- Repetido: mesma mídia, ou mesma legenda (não vazia) de um post que não foi cancelado.
    if exists (
      select 1 from public.marketing_posts p
      where p.id is distinct from v_item.post_id
        and (
          p.media = v_item.media
          or (btrim(v_item.caption) <> '' and btrim(p.caption) = btrim(v_item.caption))
        )
        and not exists (
          select 1 from public.marketing_post_targets t
          where t.post_id = p.id
          having bool_and(t.status = 'canceled')
        )
    ) then
      update public.marketing_autopost_queue set skipped_at = now() where id = v_item.id;
      insert into public.admin_audit_log (admin_id, target_user_id, action, details)
      values (null, null, 'marketingAutopostSkip', jsonb_build_object('key', v_item.key, 'format', v_item.format, 'reason', 'repetido'));
      continue;
    end if;
    exit;
  end loop;

  -- Reel é post de feed com vídeo.
  insert into public.marketing_posts (caption, media, scheduled_at, created_by, format)
  values (v_item.caption, v_item.media, null, null, case when v_item.format = 'story' then 'story' else 'feed' end)
  returning id into v_post;

  insert into public.marketing_post_targets (post_id, account_id, run_after)
  select v_post, a, now() from unnest(v_accounts) a;

  update public.marketing_autopost_queue set post_id = v_post, posted_at = now() where id = v_item.id;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (null, null, 'marketingAutopost', jsonb_build_object(
    'post', v_post, 'key', v_item.key, 'format', v_item.format, 'slot', v_item.slot, 'season', v_item.season, 'accounts', cardinality(v_accounts)
  ));
  return v_post;
end;
$$;

CREATE OR REPLACE FUNCTION public.admin_marketing_conversion(days_back integer DEFAULT 30)
 RETURNS TABLE(mc_source text, mc_medium text, mc_visits bigint, mc_signups bigint, mc_confirmed bigint, mc_activated bigint, mc_mature bigint, mc_retained bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  since timestamptz := case when coalesce(days_back, 30) <= 0 then '-infinity'::timestamptz
                            else now() - make_interval(days => least(days_back, 3650)) end;
  since_day date := case when coalesce(days_back, 30) <= 0 then '-infinity'::date
                         else (now() at time zone 'America/Sao_Paulo')::date - (least(days_back, 3650) - 1) end;
  cur date := (now() at time zone 'America/Sao_Paulo')::date;
  networks text[] := array['instagram', 'facebook', 'tiktok'];
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select u.id, u.email_confirmed_at,
             (u.created_at at time zone 'America/Sao_Paulo')::date as joined,
             u.raw_user_meta_data->'utm'->>'source' as source,
             coalesce(u.raw_user_meta_data->'utm'->>'medium', '') as medium
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.created_at >= since and not coalesce(p.is_admin, false)
        and (u.raw_user_meta_data->'utm'->>'source') = any (networks)
    ),
    td as (
      select t.user_id, t.day from public.training_days() t where t.user_id in (select id from acc)
    ),
    s as (
      select acc.source, acc.medium,
             count(*) as signups,
             count(*) filter (where acc.email_confirmed_at is not null) as confirmed,
             count(*) filter (where exists (select 1 from td where td.user_id = acc.id and td.day between acc.joined and acc.joined + 6)) as activated,
             count(*) filter (where acc.joined <= cur - 8) as mature,
             count(*) filter (where acc.joined <= cur - 8 and exists (select 1 from td where td.user_id = acc.id and td.day between acc.joined + 7 and acc.joined + 30)) as retained
      from acc group by acc.source, acc.medium
    ),
    v as (
      select pv.source, coalesce(pv.medium, '') as medium, count(*) as visits
      from public.page_visits pv
      where pv.visited_on >= since_day and pv.source = any (networks)
      group by pv.source, coalesce(pv.medium, '')
    )
    select coalesce(s.source, v.source), coalesce(s.medium, v.medium),
           coalesce(v.visits, 0)::bigint, coalesce(s.signups, 0)::bigint,
           coalesce(s.confirmed, 0)::bigint, coalesce(s.activated, 0)::bigint,
           coalesce(s.mature, 0)::bigint, coalesce(s.retained, 0)::bigint
    from s full join v on v.source = s.source and v.medium = s.medium
    order by coalesce(s.signups, 0) desc, coalesce(v.visits, 0) desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_marketing_content(days_back integer DEFAULT 30)
 RETURNS TABLE(mx_source text, mx_content text, mx_caption text, mx_visits bigint, mx_signups bigint, mx_activated bigint, mx_mature bigint, mx_retained bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  since timestamptz := case when coalesce(days_back, 30) <= 0 then '-infinity'::timestamptz
                            else now() - make_interval(days => least(days_back, 3650)) end;
  since_day date := case when coalesce(days_back, 30) <= 0 then '-infinity'::date
                         else (now() at time zone 'America/Sao_Paulo')::date - (least(days_back, 3650) - 1) end;
  cur date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select u.id,
             (u.created_at at time zone 'America/Sao_Paulo')::date as joined,
             u.raw_user_meta_data->'utm'->>'source' as source,
             u.raw_user_meta_data->'utm'->>'content' as content
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.created_at >= since and not coalesce(p.is_admin, false)
        and (u.raw_user_meta_data->'utm'->>'source') = 'facebook'
        and coalesce(u.raw_user_meta_data->'utm'->>'medium', '') = 'post'
        and coalesce(u.raw_user_meta_data->'utm'->>'content', '') <> ''
    ),
    td as (
      select t.user_id, t.day from public.training_days() t where t.user_id in (select id from acc)
    ),
    s as (
      select acc.source, acc.content,
             count(*) as signups,
             count(*) filter (where exists (select 1 from td where td.user_id = acc.id and td.day between acc.joined and acc.joined + 6)) as activated,
             count(*) filter (where acc.joined <= cur - 8) as mature,
             count(*) filter (where acc.joined <= cur - 8 and exists (select 1 from td where td.user_id = acc.id and td.day between acc.joined + 7 and acc.joined + 30)) as retained
      from acc group by acc.source, acc.content
    ),
    v as (
      select pv.source, pv.content, count(*) as visits
      from public.page_visits pv
      where pv.visited_on >= since_day and pv.source = 'facebook'
        and coalesce(pv.medium, '') = 'post' and coalesce(pv.content, '') <> ''
      group by pv.source, pv.content
    )
    select coalesce(s.source, v.source), coalesce(s.content, v.content),
           coalesce((select left(mp.caption, 140) from public.marketing_posts mp
                     where left(mp.id::text, 8) = coalesce(s.content, v.content) limit 1), ''),
           coalesce(v.visits, 0)::bigint, coalesce(s.signups, 0)::bigint, coalesce(s.activated, 0)::bigint,
           coalesce(s.mature, 0)::bigint, coalesce(s.retained, 0)::bigint
    from s full join v on v.source = s.source and v.content = s.content
    order by coalesce(s.signups, 0) desc, coalesce(v.visits, 0) desc
    limit 50;
end;
$function$;
