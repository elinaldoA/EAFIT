-- Moderação do feed de amigos (Comunidade → Moderação): denúncias feitas no
-- app e sinalização automática por palavras bloqueadas.
--
-- O conteúdo do feed é gerado pelo app (treino, recorde, sequência), mas o
-- título pode vir do nome de um dia de treino personalizado e o nome exibido é
-- o apelido/nome do perfil — por isso a denúncia. Só quem é amigo (amizade
-- aceita) do dono da publicação pode denunciar; uma denúncia por pessoa e
-- publicação.
--
-- Palavras bloqueadas: app_settings 'feed_blocked_words' ({ "words": [...] }).
-- Nada é escondido automaticamente: o painel lista o que bate para o admin decidir.

create table if not exists public.feed_reports (
  id bigint generated always as identity primary key,
  event_id bigint references public.feed_events(id) on delete set null,
  reported_user uuid references auth.users(id) on delete cascade,
  reporter uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('ofensivo', 'spam', 'falso', 'outro')),
  note text check (note is null or char_length(note) <= 300),
  snapshot text check (snapshot is null or char_length(snapshot) <= 300),
  status text not null default 'aberta' check (status in ('aberta', 'removida', 'bloqueado', 'ignorada')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (event_id, reporter)
);

create index if not exists feed_reports_status_idx on public.feed_reports (status, created_at desc);
create index if not exists feed_reports_reported_idx on public.feed_reports (reported_user);

alter table public.feed_reports enable row level security;
drop policy if exists "admin reads feed reports" on public.feed_reports;
create policy "admin reads feed reports" on public.feed_reports for select using (public.is_admin());
drop policy if exists "admin updates feed reports" on public.feed_reports;
create policy "admin updates feed reports" on public.feed_reports for update
  using (public.admin_can('users')) with check (public.admin_can('users'));
revoke all on public.feed_reports from anon;

-- App: denunciar uma publicação do feed de amigos.
create or replace function public.report_feed_event(p_event bigint, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ev public.feed_events;
  who text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_reason not in ('ofensivo', 'spam', 'falso', 'outro') then raise exception 'invalid_reason'; end if;
  select * into ev from public.feed_events where id = p_event;
  if not found or ev.user_id = auth.uid() then raise exception 'not_found'; end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = ev.user_id) or (f.addressee_id = auth.uid() and f.requester_id = ev.user_id))
  ) then
    raise exception 'not_found';
  end if;
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), nullif(btrim(u.raw_user_meta_data->>'nome'), ''), '')
    into who from auth.users u where u.id = ev.user_id;
  insert into public.feed_reports (event_id, reported_user, reporter, reason, note, snapshot)
  values (ev.id, ev.user_id, auth.uid(), p_reason, nullif(left(btrim(coalesce(p_note, '')), 300), ''),
          left(who || ': ' || ev.title || coalesce(' · ' || ev.detail, ''), 300))
  on conflict (event_id, reporter) do nothing;
end;
$$;

revoke execute on function public.report_feed_event(bigint, text, text) from public, anon;
grant execute on function public.report_feed_event(bigint, text, text) to authenticated;

-- Painel: denúncias agrupadas por publicação (e pessoa denunciada), com as
-- outras denúncias contra a mesma pessoa e se ela já está bloqueada no feed.
create or replace function public.admin_feed_reports(p_status text default 'aberta')
returns table (
  fr_event bigint, fr_user uuid, fr_user_name text, fr_snapshot text, fr_reasons text[], fr_notes text[],
  fr_reports bigint, fr_first timestamptz, fr_last timestamptz, fr_status text,
  fr_user_reports bigint, fr_blocked boolean, fr_event_exists boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
    select r.event_id, r.reported_user,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), u.email::text),
           (array_agg(r.snapshot order by r.created_at desc))[1],
           array_agg(distinct r.reason),
           array_remove(array_agg(r.note order by r.created_at desc), null),
           count(*), min(r.created_at), max(r.created_at), min(r.status),
           (select count(*) from public.feed_reports o where o.reported_user = r.reported_user),
           coalesce((select fp.feed_blocked from public.friend_profiles fp where fp.user_id = r.reported_user), false),
           exists (select 1 from public.feed_events e where e.id = r.event_id)
    from public.feed_reports r
    left join auth.users u on u.id = r.reported_user
    where coalesce(p_status, '') = '' or r.status = p_status
    group by r.event_id, r.reported_user, u.raw_user_meta_data, u.email
    order by count(*) desc, max(r.created_at) desc
    limit 200;
end;
$$;

-- Resolve todas as denúncias da publicação (ou da pessoa, sem publicação).
create or replace function public.admin_resolve_feed_reports(p_event bigint, p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can('users') then raise exception 'not_authorized'; end if;
  if p_status not in ('removida', 'bloqueado', 'ignorada', 'aberta') then raise exception 'invalid_status'; end if;
  update public.feed_reports
     set status = p_status,
         resolved_at = case when p_status = 'aberta' then null else now() end,
         resolved_by = case when p_status = 'aberta' then null else auth.uid() end
   where reported_user = p_user and (event_id = p_event or (p_event is null and event_id is null));
end;
$$;

-- Publicações e apelidos recentes (30 dias) com alguma palavra bloqueada.
create or replace function public.admin_feed_flags()
returns table (ff_event bigint, ff_user uuid, ff_name text, ff_text text, ff_word text, ff_at timestamptz, ff_blocked boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  words text[];
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  select array(select lower(btrim(w)) from jsonb_array_elements_text(coalesce(value->'words', '[]'::jsonb)) w where btrim(w) <> '')
    into words from public.app_settings where key = 'feed_blocked_words';
  if words is null or cardinality(words) = 0 then return; end if;

  return query
    with ev as (
      select e.id, e.user_id, e.created_at,
             coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), nullif(btrim(u.raw_user_meta_data->>'nome'), ''), '') as name,
             e.title || coalesce(' · ' || e.detail, '') as txt
      from public.feed_events e
      join auth.users u on u.id = e.user_id
      where e.created_at >= now() - interval '30 days'
    )
    select ev.id, ev.user_id, ev.name, ev.txt, w, ev.created_at,
           coalesce((select fp.feed_blocked from public.friend_profiles fp where fp.user_id = ev.user_id), false)
    from ev
    cross join lateral (
      select w from unnest(words) w
      where lower(ev.txt) like '%' || w || '%' or lower(ev.name) like '%' || w || '%'
      limit 1
    ) m
    order by ev.created_at desc
    limit 200;
end;
$$;

revoke execute on function public.admin_feed_reports(text) from public, anon;
revoke execute on function public.admin_resolve_feed_reports(bigint, uuid, text) from public, anon;
revoke execute on function public.admin_feed_flags() from public, anon;
grant execute on function public.admin_feed_reports(text) to authenticated;
grant execute on function public.admin_resolve_feed_reports(bigint, uuid, text) to authenticated;
grant execute on function public.admin_feed_flags() to authenticated;
