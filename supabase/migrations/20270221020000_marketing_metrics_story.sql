-- Marketing → Resultados: stories do Instagram também entram no desempenho
-- (kind 'story'; respostas viram `comments`). A API só lista os stories ainda no ar
-- (24 h), então o job de métricas (de 3 em 3 horas) guarda o último retrato de cada um.

alter table public.marketing_post_metrics drop constraint if exists marketing_post_metrics_kind_check;
alter table public.marketing_post_metrics add constraint marketing_post_metrics_kind_check
  check (kind in ('reel', 'carousel', 'image', 'video', 'text', 'story'));

-- Só a service role chama (Edge Function marketing). Igual à anterior, aceitando 'story'.
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
  select p_account, r ->> 'external_id', r ->> 'permalink', left(coalesce(r ->> 'caption', ''), 300),
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
