-- Desativação de conta pelo admin.
--
-- Diferente de banir (punição) e de excluir (apaga tudo): a conta fica
-- guardada com todos os dados, mas fora do ar até um admin reativar. O
-- bloqueio do login é o mesmo do banimento (auth.users.banned_until, gravado
-- pela edge function admin-users), então tudo que já ignora conta banida —
-- e-mails, notificações de engajamento, usuários em risco, planos vencendo —
-- ignora a desativada sem mudar nada. Esta tabela é o que diferencia os dois
-- estados e guarda motivo, autor e data.
--
-- Escrita só pela edge function (service role). O app não lê a tabela: usa
-- my_account_deactivated(), que não expõe motivo nem quem desativou.

create table if not exists public.account_deactivations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text check (reason is null or length(reason) <= 500),
  deactivated_by uuid references auth.users(id) on delete set null,
  deactivated_by_email text,
  deactivated_at timestamptz not null default now()
);

alter table public.account_deactivations enable row level security;

drop policy if exists "admin reads deactivations" on public.account_deactivations;
create policy "admin reads deactivations" on public.account_deactivations
  for select using (public.is_admin());

-- Auxiliar das funções abaixo (não exposta ao app).
create or replace function public.is_deactivated(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.account_deactivations d where d.user_id = p_user);
$$;

revoke execute on function public.is_deactivated(uuid) from public, anon, authenticated;

-- O app pergunta ao abrir e ao voltar para a tela: uma sessão já aberta no
-- aparelho continua com token válido até expirar, e é isto que a encerra na hora.
create or replace function public.my_account_deactivated()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_deactivated(auth.uid());
$$;

revoke execute on function public.my_account_deactivated() from public, anon;
grant execute on function public.my_account_deactivated() to authenticated;

-- ---------------------------------------------------------------------------
-- Comunidade: conta desativada some para os outros. As funções são recriadas
-- com as mesmas colunas de saída; só muda o filtro.
-- ---------------------------------------------------------------------------

-- Feed e reações passam por aqui: sem "amizade" com conta desativada, as
-- publicações dela saem do feed dos amigos e não recebem reação.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  ) and not public.is_deactivated(a) and not public.is_deactivated(b);
$$;

create or replace function public.my_friends()
returns table (fr_id bigint, fr_name text, fr_status text, fr_week int)
language sql
stable
security definer
set search_path = public
as $$
  with rel as (
    select f.id,
           case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as other,
           case when f.status = 'accepted' then 'friend'
                when f.requester_id = auth.uid() then 'outgoing'
                else 'incoming' end as st,
           f.created_at
    from public.friendships f
    where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  ),
  week as (
    select td.user_id, count(*)::int as n
    from public.training_days() td
    where td.day > (now() at time zone 'America/Sao_Paulo')::date - 7
      and td.user_id in (select other from rel where st = 'friend')
    group by td.user_id
  )
  select rel.id,
         public.friend_display_name(rel.other),
         rel.st,
         case when rel.st = 'friend' and coalesce(fp.share_activity, true)
              then coalesce(week.n, 0) end
  from rel
  left join public.friend_profiles fp on fp.user_id = rel.other
  left join week on week.user_id = rel.other
  where not public.is_deactivated(rel.other)
  order by (rel.st = 'incoming') desc, (rel.st = 'friend') desc, rel.created_at desc;
$$;

create or replace function public.my_challenges()
returns table (
  ch_id uuid,
  ch_title text,
  ch_code text,
  ch_start date,
  ch_end date,
  ch_members bigint,
  ch_score int,
  ch_rank int
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.title, c.invite_code, c.start_date, c.end_date
    from public.challenges c
    join public.challenge_members m on m.challenge_id = c.id
    where m.user_id = auth.uid()
      and c.end_date >= (now() at time zone 'America/Sao_Paulo')::date - 14
  ),
  scores as (
    select cm.challenge_id, cm.user_id, count(td.day)::int as score
    from public.challenge_members cm
    join mine on mine.id = cm.challenge_id
    left join public.training_days() td
      on td.user_id = cm.user_id and td.day between mine.start_date and mine.end_date
    where cm.role = 'member' and not public.is_deactivated(cm.user_id)
    group by cm.challenge_id, cm.user_id
  ),
  ranked as (
    select s.challenge_id, s.user_id, s.score,
           rank() over (partition by s.challenge_id order by s.score desc)::int as rk
    from scores s
  )
  select mine.id, mine.title, mine.invite_code, mine.start_date, mine.end_date,
         (select count(*) from public.challenge_members x
           where x.challenge_id = mine.id and x.role = 'member' and not public.is_deactivated(x.user_id)),
         r.score, r.rk
  from mine
  left join ranked r on r.challenge_id = mine.id and r.user_id = auth.uid()
  order by mine.end_date >= (now() at time zone 'America/Sao_Paulo')::date desc, mine.end_date;
$$;

create or replace function public.challenge_leaderboard(p_id uuid)
returns table (lb_name text, lb_score int, lb_rank int, lb_is_me boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  with ch as (
    select c.id, c.start_date, c.end_date
    from public.challenges c
    where c.id = p_id
      and exists (select 1 from public.challenge_members m where m.challenge_id = c.id and m.user_id = auth.uid())
  ),
  scores as (
    select cm.user_id, count(td.day)::int as score
    from public.challenge_members cm
    join ch on ch.id = cm.challenge_id
    left join public.training_days() td
      on td.user_id = cm.user_id and td.day between ch.start_date and ch.end_date
    where cm.role = 'member' and not public.is_deactivated(cm.user_id)
    group by cm.user_id
  )
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''),
                  nullif(split_part(btrim(coalesce(u.raw_user_meta_data->>'nome', '')), ' ', 1), ''),
                  'Atleta'),
         s.score,
         rank() over (order by s.score desc)::int,
         s.user_id = auth.uid()
  from scores s
  join auth.users u on u.id = s.user_id
  order by 3, 1;
$$;

-- ---------------------------------------------------------------------------
-- Lista de usuários do admin: filtro 'deactivated', e 'banned' passa a ser só
-- quem foi banido de fato. Mesma assinatura e colunas de 20261006010000 — a
-- lista marca a linha desativada lendo account_deactivations à parte.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users_page(
  search text default null,
  status_filter text default null,
  page_size int default 50,
  page_offset int default 0,
  sort_by text default 'created_desc', -- created_desc|created_asc|login_desc|training_desc|training_asc|trainings_desc
  nivel_filter text default null,
  meta_filter text default null
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  is_admin boolean,
  nome text,
  sobrenome text,
  apelido text,
  peso_alvo text,
  nivel text,
  meta text,
  last_training date,
  trainings_30d bigint,
  plan_end_date date,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
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
$$;
