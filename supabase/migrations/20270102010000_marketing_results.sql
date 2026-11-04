-- Marketing → Resultados.
--
--   1. marketing_post_metrics: desempenho dos últimos posts de cada rede
--      conectada (curtidas, comentários, compartilhamentos, salvamentos, alcance,
--      visualizações). Vem da API da rede, inclusive de posts feitos direto no app
--      do Instagram/Facebook/Threads. Quem grava é a Edge Function marketing
--      (job 'metrics', de 3 em 3 horas, ou o botão "Atualizar" do painel).
--      Alcance e salvamentos dependem da permissão de insights da conta
--      (insights_ok = false quando a rede não liberou).
--   2. admin_marketing_conversion: visitas e cadastros que vieram das redes, por
--      origem (instagram, facebook…) e tipo de link (utm_medium: bio, story, post,
--      ads, parceiro), no mesmo molde de admin_campaign_attribution.

create table if not exists public.marketing_post_metrics (
  account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  external_id text not null,
  permalink text,
  caption text not null default '',
  kind text not null default 'image' check (kind in ('reel', 'carousel', 'image', 'video', 'text')),
  thumb_url text,
  posted_at timestamptz,
  likes int,
  comments int,
  shares int,
  saves int,
  reach int,
  views int,
  insights_ok boolean not null default false,
  fetched_at timestamptz not null default now(),
  primary key (account_id, external_id)
);

create index if not exists marketing_post_metrics_posted_idx on public.marketing_post_metrics (posted_at desc);

alter table public.marketing_post_metrics enable row level security;
revoke all on public.marketing_post_metrics from anon;
drop policy if exists "admins read marketing_post_metrics" on public.marketing_post_metrics;
create policy "admins read marketing_post_metrics" on public.marketing_post_metrics for select using (public.is_admin());

-- Só a service role chama (Edge Function marketing).
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
    case when r ->> 'kind' in ('reel', 'carousel', 'image', 'video', 'text') then r ->> 'kind' else 'image' end,
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
    comments = excluded.comments,
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

-- A cada 3 horas, só se houver conta conectada que a função consiga ler.
select cron.schedule(
  'marketing-sync-metrics',
  '15 */3 * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/marketing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"job": "metrics"}'::jsonb
  )
  where exists (select 1 from public.marketing_accounts where status = 'ok' and platform <> 'tiktok');
  $$
);

-- Visitas e cadastros vindos das redes, por origem e tipo de link, no período
-- (days_back <= 0 = desde sempre), sem admins:
--   mc_visits     visitas à landing e à tela de acesso com essa origem/tipo
--   mc_signups    contas criadas
--   mc_confirmed  com e-mail confirmado
--   mc_activated  treinaram nos 7 primeiros dias
create or replace function public.admin_marketing_conversion(days_back int default 30)
returns table (
  mc_source text, mc_medium text, mc_visits bigint, mc_signups bigint, mc_confirmed bigint, mc_activated bigint
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
  networks text[] := array['instagram', 'facebook', 'threads', 'tiktok'];
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
             count(*) filter (where exists (select 1 from td where td.user_id = acc.id and td.day between acc.joined and acc.joined + 6)) as activated
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
           coalesce(s.confirmed, 0)::bigint, coalesce(s.activated, 0)::bigint
    from s full join v on v.source = s.source and v.medium = s.medium
    order by coalesce(s.signups, 0) desc, coalesce(v.visits, 0) desc;
end;
$$;

revoke execute on function public.admin_marketing_conversion(int) from public, anon;
grant execute on function public.admin_marketing_conversion(int) to authenticated;
