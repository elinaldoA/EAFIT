-- Marketing -> Resultados: cadastros e retencao por post.
--
-- Os posts do Facebook e do Threads saem com um link do app marcado
-- (?utm_source=<rede>&utm_medium=post&utm_content=<8 primeiros caracteres do id do post>),
-- ver trackedCaption em supabase/functions/_shared/marketing.ts. Esta funcao liga cada
-- cadastro ao post que o trouxe e mostra, como em admin_marketing_conversion, quem
-- treinou na 1a semana e quem seguiu treinando entre o dia 8 e o dia 30.

create or replace function public.admin_marketing_content(days_back int default 30)
returns table (
  mx_source text, mx_content text, mx_caption text, mx_visits bigint, mx_signups bigint,
  mx_activated bigint, mx_mature bigint, mx_retained bigint
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
        and (u.raw_user_meta_data->'utm'->>'source') in ('facebook', 'threads')
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
      where pv.visited_on >= since_day and pv.source in ('facebook', 'threads')
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
$$;

revoke execute on function public.admin_marketing_content(int) from public, anon;
grant execute on function public.admin_marketing_content(int) to authenticated;
