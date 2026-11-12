-- Marketing → Resultados: base das análises novas.
--   1. marketing_accounts.metrics_note: por que o alcance não veio na última coleta
--      (mensagem da Meta). Null quando o alcance está chegando.
--   2. marketing_upsert_metrics guarda a legenda inteira (até 2.200 caracteres): a análise
--      de hashtags precisa do final da legenda, onde elas ficam.
--   3. admin_marketing_ads: visitas e cadastros dos links de anúncio (utm_medium=ads) de
--      Instagram e Facebook, por conteúdo (utm_content = id ou nome do anúncio). Dá o custo
--      por cadastro quando cruzado com o gasto que a Meta informa.

alter table public.marketing_accounts add column if not exists metrics_note text;

create or replace function public.marketing_upsert_metrics(p_account uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into public.marketing_post_metrics as m (
    account_id, external_id, permalink, caption, kind, thumb_url, posted_at,
    likes, comments, shares, saves, reach, views, insights_ok, fetched_at
  )
  select p_account, r ->> 'external_id', r ->> 'permalink', left(coalesce(r ->> 'caption', ''), 2200),
    case when r ->> 'kind' in ('reel', 'carousel', 'image', 'video', 'text', 'story') then r ->> 'kind' else 'image' end,
    r ->> 'thumb_url', (r ->> 'posted_at')::timestamptz,
    (r ->> 'likes')::int, (r ->> 'comments')::int, (r ->> 'shares')::int, (r ->> 'saves')::int,
    (r ->> 'reach')::int, (r ->> 'views')::int, coalesce((r ->> 'insights_ok')::boolean, false), now()
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r ->> 'external_id', '') <> ''
  on conflict (account_id, external_id) do update set
    permalink = excluded.permalink,
    caption = excluded.caption,
    kind = excluded.kind,
    thumb_url = coalesce(excluded.thumb_url, m.thumb_url),
    posted_at = coalesce(excluded.posted_at, m.posted_at),
    likes = excluded.likes,
    comments = coalesce(excluded.comments, m.comments),
    shares = coalesce(excluded.shares, m.shares),
    saves = coalesce(excluded.saves, m.saves),
    reach = coalesce(excluded.reach, m.reach),
    views = coalesce(excluded.views, m.views),
    insights_ok = excluded.insights_ok or m.insights_ok,
    fetched_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.marketing_upsert_metrics(uuid, jsonb) from public, anon, authenticated;

create or replace function public.admin_marketing_ads(days_back integer default 30)
returns table (
  mx_source text, mx_content text, mx_visits bigint, mx_signups bigint, mx_activated bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since timestamptz := case when coalesce(days_back, 30) <= 0 then '-infinity'::timestamptz
                            else now() - make_interval(days => least(days_back, 3650)) end;
  since_day date := case when coalesce(days_back, 30) <= 0 then '-infinity'::date
                         else (now() at time zone 'America/Sao_Paulo')::date - (least(days_back, 3650) - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select u.id,
             (u.created_at at time zone 'America/Sao_Paulo')::date as joined,
             u.raw_user_meta_data->'utm'->>'source' as source,
             coalesce(u.raw_user_meta_data->'utm'->>'content', '') as content
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.created_at >= since and not coalesce(p.is_admin, false)
        and (u.raw_user_meta_data->'utm'->>'source') in ('facebook', 'instagram')
        and coalesce(u.raw_user_meta_data->'utm'->>'medium', '') = 'ads'
    ),
    td as (
      select t.user_id, t.day from public.training_days() t where t.user_id in (select id from acc)
    ),
    s as (
      select acc.source, acc.content, count(*) as signups,
             count(*) filter (where exists (select 1 from td where td.user_id = acc.id and td.day between acc.joined and acc.joined + 6)) as activated
      from acc group by acc.source, acc.content
    ),
    v as (
      select pv.source, coalesce(pv.content, '') as content, count(*) as visits
      from public.page_visits pv
      where pv.visited_on >= since_day and pv.source in ('facebook', 'instagram') and coalesce(pv.medium, '') = 'ads'
      group by pv.source, coalesce(pv.content, '')
    )
    select coalesce(s.source, v.source), coalesce(s.content, v.content),
           coalesce(v.visits, 0)::bigint, coalesce(s.signups, 0)::bigint, coalesce(s.activated, 0)::bigint
    from s full join v on v.source = s.source and v.content = s.content
    order by coalesce(s.signups, 0) desc, coalesce(v.visits, 0) desc
    limit 200;
end;
$$;
revoke execute on function public.admin_marketing_ads(integer) from public, anon;
grant execute on function public.admin_marketing_ads(integer) to authenticated;
