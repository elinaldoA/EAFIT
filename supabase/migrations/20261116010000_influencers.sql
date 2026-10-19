-- Influenciadores, fase 1: programas de treino próprios, página pública e a
-- marca do influenciador no app do seguidor.
--
-- Quem é influenciador: um embaixador (public.ambassadors, migration
-- 20261108010000) promovido pelo admin (is_influencer). O código do embaixador
-- é também o @ do influenciador e o link da página: eafit.com.br/i/?u=<code>.
-- Como o embaixador, ele NUNCA vê quem são os seguidores — só números.
--
-- Programas (influencer_programs): o influenciador monta no app; `draft` é a
-- versão em edição e `published` a que está no ar. Toda edição passa pela
-- aprovação do admin (status review → approved/rejected), e enquanto isso a
-- versão publicada continua valendo para quem chega. Formato dos dois:
--   { name, description, level: iniciante|intermediario|avancado, weeks,
--     days: [{ dia, foco, exercicios: [{nome, series, reps, descanso, tecnica, grupo, aquecimento}] }] }
--
-- Seguir (influencer_follows): o seguidor segue quantos quiser; o crédito do
-- cadastro continua sendo do link (ambassador_referrals). Começar um programa
-- (adopt_influencer_program) cria um plano comum do usuário, com
-- workout_plans.program_id apontando para o programa, e já segue o
-- influenciador. Excluir o programa não mexe nos planos já criados.
--
-- Acesso: as tabelas novas têm RLS ligado e nenhuma policy — tudo passa pelas
-- funções abaixo (security definer), como em desafios e embaixadores.
-- Foto do influenciador: a mesma do perfil do app (profiles.avatar_data).

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
alter table public.ambassadors
  add column if not exists is_influencer boolean not null default false,
  add column if not exists bio text,
  add column if not exists instagram text,
  add column if not exists accent text;

alter table public.ambassadors drop constraint if exists ambassadors_influencer_profile_check;
alter table public.ambassadors
  add constraint ambassadors_influencer_profile_check check (
    (bio is null or length(bio) <= 280)
    and (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$')
    and (accent is null or accent ~ '^#[0-9a-fA-F]{6}$')
  );

create table if not exists public.influencer_programs (
  id uuid primary key default gen_random_uuid(),
  ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  draft jsonb not null,
  status text not null default 'editing' check (status in ('editing', 'review', 'rejected', 'approved')),
  review_note text,
  published jsonb,
  published_at timestamptz,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists influencer_programs_ambassador_idx on public.influencer_programs (ambassador_id);
create index if not exists influencer_programs_review_idx on public.influencer_programs (status) where status = 'review';
alter table public.influencer_programs enable row level security;

create table if not exists public.influencer_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  ambassador_id uuid not null references public.ambassadors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, ambassador_id)
);

create index if not exists influencer_follows_ambassador_idx on public.influencer_follows (ambassador_id);
alter table public.influencer_follows enable row level security;

alter table public.workout_plans
  add column if not exists program_id uuid references public.influencer_programs(id) on delete set null;
create index if not exists workout_plans_program_idx on public.workout_plans (program_id) where program_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Embaixador-influenciador ativo da conta logada (ou null).
create or replace function public.my_influencer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id from public.ambassadors a
  where a.user_id = auth.uid() and a.is_influencer and a.active
  limit 1;
$$;

-- Erro de validação do programa (código curto) ou null quando está ok.
create or replace function public.influencer_program_error(p jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then 'invalid_program'
    when length(btrim(coalesce(p->>'name', ''))) not between 2 and 60 then 'invalid_name'
    when length(coalesce(p->>'description', '')) > 500 then 'invalid_description'
    when coalesce(p->>'level', '') not in ('iniciante', 'intermediario', 'avancado') then 'invalid_level'
    when p->>'weeks' is not null and (p->>'weeks' !~ '^\d{1,2}$' or (p->>'weeks')::int not between 1 and 52) then 'invalid_duration'
    when jsonb_typeof(p->'days') is distinct from 'array' or jsonb_array_length(p->'days') not between 1 and 7 then 'invalid_days'
    when exists (
      select 1 from jsonb_array_elements(p->'days') d
      where jsonb_typeof(d->'exercicios') is distinct from 'array'
         or jsonb_array_length(d->'exercicios') not between 1 and 20
         or exists (select 1 from jsonb_array_elements(d->'exercicios') e where length(btrim(coalesce(e->>'nome', ''))) = 0)
    ) then 'invalid_exercises'
    else null
  end;
$$;

-- Resumo público do influenciador (sem user_id nem e-mail).
create or replace function public.influencer_card(a public.ambassadors)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'code', a.code,
    'name', a.name,
    'bio', a.bio,
    'instagram', a.instagram,
    'accent', a.accent,
    'avatar', (select p.avatar_data from public.profiles p where p.id = a.user_id),
    'followers', (select count(*) from public.influencer_follows f where f.ambassador_id = a.id)
  );
$$;

-- Programa como aparece na vitrine: o publicado, sem os dias.
create or replace function public.influencer_program_card(pr public.influencer_programs)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', pr.id,
    'name', pr.published->>'name',
    'description', coalesce(pr.published->>'description', ''),
    'level', pr.published->>'level',
    'weeks', (pr.published->>'weeks')::int,
    'days', jsonb_array_length(pr.published->'days'),
    'exercises', (select coalesce(sum(jsonb_array_length(d->'exercicios')), 0)::int from jsonb_array_elements(pr.published->'days') d),
    'adoptions', (select count(*) from public.workout_plans w where w.program_id = pr.id)
  );
$$;

revoke execute on function public.influencer_card(public.ambassadors) from public, anon, authenticated;
revoke execute on function public.influencer_program_card(public.influencer_programs) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Público (site e app, inclusive sem login)
-- ---------------------------------------------------------------------------

-- Página do influenciador: perfil e programas publicados. Null se o código não
-- é de influenciador ativo.
create or replace function public.influencer_profile(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.influencer_card(a) || jsonb_build_object(
    'programs', coalesce((
      select jsonb_agg(public.influencer_program_card(pr) order by pr.published_at desc)
      from public.influencer_programs pr
      where pr.ambassador_id = a.id and pr.published is not null and not pr.hidden
    ), '[]'::jsonb)
  )
  from public.ambassadors a
  where a.code = lower(btrim(p_code)) and a.is_influencer and a.active;
$$;

-- Programa publicado completo (com os dias) e o influenciador dono.
create or replace function public.influencer_program(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.influencer_program_card(pr) || jsonb_build_object(
    'plan', pr.published->'days',
    'influencer', public.influencer_card(a)
  )
  from public.influencer_programs pr
  join public.ambassadors a on a.id = pr.ambassador_id
  where pr.id = p_id and pr.published is not null and not pr.hidden and a.is_influencer and a.active;
$$;

-- Vitrine do app: influenciadores com ao menos um programa no ar.
create or replace function public.influencers_directory()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(card order by (card->>'followers')::int desc, card->>'name'), '[]'::jsonb)
  from (
    select public.influencer_card(a) || jsonb_build_object(
      'programs', (select count(*) from public.influencer_programs pr
                   where pr.ambassador_id = a.id and pr.published is not null and not pr.hidden),
      'following', exists (select 1 from public.influencer_follows f where f.ambassador_id = a.id and f.user_id = auth.uid())
    ) as card
    from public.ambassadors a
    where a.is_influencer and a.active
      and exists (select 1 from public.influencer_programs pr
                  where pr.ambassador_id = a.id and pr.published is not null and not pr.hidden)
  ) s;
$$;

grant execute on function public.influencer_profile(text) to anon, authenticated;
grant execute on function public.influencer_program(uuid) to anon, authenticated;
grant execute on function public.influencers_directory() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seguidor
-- ---------------------------------------------------------------------------
create or replace function public.influencer_follow(p_code text, p_follow boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select a.id into v_id from public.ambassadors a
  where a.code = lower(btrim(p_code)) and a.is_influencer and a.active;
  if v_id is null then raise exception 'influencer_not_found'; end if;

  if p_follow then
    insert into public.influencer_follows (user_id, ambassador_id) values (auth.uid(), v_id)
    on conflict do nothing;
  else
    delete from public.influencer_follows where user_id = auth.uid() and ambassador_id = v_id;
  end if;
  return p_follow;
end;
$$;

-- Começa o programa: vira o plano ativo do usuário (o anterior fica salvo,
-- inativo) e segue o influenciador. Devolve o id do plano novo.
create or replace function public.adopt_influencer_program(p_program uuid, p_start_date date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr public.influencer_programs;
  v_plan public.workout_plans;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select pr.* into v_pr
  from public.influencer_programs pr
  join public.ambassadors a on a.id = pr.ambassador_id
  where pr.id = p_program and pr.published is not null and not pr.hidden and a.is_influencer and a.active;
  if v_pr.id is null then raise exception 'program_not_found'; end if;

  v_plan := public.create_workout_plan(
    auth.uid(), v_pr.published->>'name', v_pr.published->'days', true,
    coalesce(p_start_date, (now() at time zone 'America/Sao_Paulo')::date),
    (v_pr.published->>'weeks')::int
  );
  update public.workout_plans set program_id = v_pr.id where id = v_plan.id;

  insert into public.influencer_follows (user_id, ambassador_id) values (auth.uid(), v_pr.ambassador_id)
  on conflict do nothing;

  return v_plan.id;
end;
$$;

-- Programa do plano ativo, para a marca do influenciador na tela de treino.
-- Funciona mesmo se o programa foi escondido depois (o plano já é do usuário).
create or replace function public.my_active_program()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', pr.id,
    'name', coalesce(pr.published->>'name', w.name),
    'influencer', public.influencer_card(a)
  )
  from public.workout_plans w
  join public.influencer_programs pr on pr.id = w.program_id
  join public.ambassadors a on a.id = pr.ambassador_id
  where w.user_id = auth.uid() and w.is_active and a.active
  limit 1;
$$;

-- Quem a conta segue (backup de dados do usuário, lib/exportData.js).
create or replace function public.my_followed_influencers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'followedAt', f.created_at) order by f.created_at), '[]'::jsonb)
  from public.influencer_follows f
  join public.ambassadors a on a.id = f.ambassador_id
  where f.user_id = auth.uid();
$$;

revoke execute on function public.my_followed_influencers() from public, anon;
grant execute on function public.my_followed_influencers() to authenticated;
revoke execute on function public.influencer_follow(text, boolean) from public, anon;
revoke execute on function public.adopt_influencer_program(uuid, date) from public, anon;
revoke execute on function public.my_active_program() from public, anon;
grant execute on function public.influencer_follow(text, boolean) to authenticated;
grant execute on function public.adopt_influencer_program(uuid, date) to authenticated;
grant execute on function public.my_active_program() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Influenciador (a própria conta)
-- ---------------------------------------------------------------------------

-- Perfil e todos os programas (rascunho, status e o que está no ar), ou null
-- se a conta não é influenciadora ativa.
create or replace function public.my_influencer()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.influencer_card(a) || jsonb_build_object(
    'programs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'draft', pr.draft, 'status', pr.status, 'review_note', pr.review_note,
        'live', pr.published is not null, 'hidden', pr.hidden, 'published_at', pr.published_at,
        'adoptions', (select count(*) from public.workout_plans w where w.program_id = pr.id),
        'updated_at', pr.updated_at
      ) order by pr.created_at)
      from public.influencer_programs pr where pr.ambassador_id = a.id
    ), '[]'::jsonb)
  )
  from public.ambassadors a
  where a.id = public.my_influencer_id();
$$;

create or replace function public.influencer_save_profile(p_bio text, p_instagram text, p_accent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := public.my_influencer_id();
begin
  if v_id is null then raise exception 'not_influencer'; end if;
  update public.ambassadors
    set bio = nullif(btrim(coalesce(p_bio, '')), ''),
        instagram = nullif(ltrim(btrim(coalesce(p_instagram, '')), '@'), ''),
        accent = nullif(btrim(coalesce(p_accent, '')), ''),
        updated_at = now()
    where id = v_id;
end;
$$;

-- Cria (p_id null) ou edita o rascunho. Toda edição volta para 'editing' até
-- ser enviada para revisão. Máx. 20 programas por influenciador.
create or replace function public.influencer_save_program(p_id uuid, p_program jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inf uuid := public.my_influencer_id();
  v_err text;
  v_id uuid;
begin
  if v_inf is null then raise exception 'not_influencer'; end if;
  v_err := public.influencer_program_error(p_program);
  if v_err is not null then raise exception '%', v_err; end if;

  if p_id is null then
    if (select count(*) from public.influencer_programs where ambassador_id = v_inf) >= 20 then
      raise exception 'too_many_programs';
    end if;
    insert into public.influencer_programs (ambassador_id, draft) values (v_inf, p_program)
    returning id into v_id;
  else
    update public.influencer_programs
      set draft = p_program, status = 'editing', review_note = null, updated_at = now()
      where id = p_id and ambassador_id = v_inf
      returning id into v_id;
    if v_id is null then raise exception 'program_not_found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.influencer_submit_program(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inf uuid := public.my_influencer_id();
begin
  if v_inf is null then raise exception 'not_influencer'; end if;
  update public.influencer_programs
    set status = 'review', updated_at = now()
    where id = p_id and ambassador_id = v_inf and status in ('editing', 'rejected');
  if not found then raise exception 'program_not_found'; end if;
end;
$$;

create or replace function public.influencer_set_program_hidden(p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inf uuid := public.my_influencer_id();
begin
  if v_inf is null then raise exception 'not_influencer'; end if;
  update public.influencer_programs set hidden = p_hidden, updated_at = now()
    where id = p_id and ambassador_id = v_inf;
  if not found then raise exception 'program_not_found'; end if;
end;
$$;

create or replace function public.influencer_delete_program(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inf uuid := public.my_influencer_id();
begin
  if v_inf is null then raise exception 'not_influencer'; end if;
  delete from public.influencer_programs where id = p_id and ambassador_id = v_inf;
  if not found then raise exception 'program_not_found'; end if;
end;
$$;

revoke execute on function public.my_influencer_id() from public, anon;
revoke execute on function public.my_influencer() from public, anon;
revoke execute on function public.influencer_save_profile(text, text, text) from public, anon;
revoke execute on function public.influencer_save_program(uuid, jsonb) from public, anon;
revoke execute on function public.influencer_submit_program(uuid) from public, anon;
revoke execute on function public.influencer_set_program_hidden(uuid, boolean) from public, anon;
revoke execute on function public.influencer_delete_program(uuid) from public, anon;
grant execute on function public.my_influencer_id() to authenticated;
grant execute on function public.my_influencer() to authenticated;
grant execute on function public.influencer_save_profile(text, text, text) to authenticated;
grant execute on function public.influencer_save_program(uuid, jsonb) to authenticated;
grant execute on function public.influencer_submit_program(uuid) to authenticated;
grant execute on function public.influencer_set_program_hidden(uuid, boolean) to authenticated;
grant execute on function public.influencer_delete_program(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Admin
-- ---------------------------------------------------------------------------

-- Promove/rebaixa o embaixador a influenciador (área 'users').
create or replace function public.admin_set_influencer(p_ambassador uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can('users') then raise exception 'not_authorized'; end if;
  update public.ambassadors set is_influencer = p_on, updated_at = now() where id = p_ambassador;
  if not found then raise exception 'ambassador_not_found'; end if;
end;
$$;

-- Programas para o painel (padrão: os que aguardam revisão).
create or replace function public.admin_influencer_programs(p_status text default 'review')
returns table (
  ip_id uuid, ip_ambassador uuid, ip_influencer text, ip_code text, ip_status text, ip_draft jsonb,
  ip_published jsonb, ip_review_note text, ip_hidden boolean, ip_adoptions bigint, ip_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
    select pr.id, a.id, a.name, a.code, pr.status, pr.draft, pr.published, pr.review_note, pr.hidden,
           (select count(*) from public.workout_plans w where w.program_id = pr.id), pr.updated_at
    from public.influencer_programs pr
    join public.ambassadors a on a.id = pr.ambassador_id
    where p_status is null or pr.status = p_status
    order by pr.updated_at;
end;
$$;

-- Aprova (o rascunho vai ao ar) ou recusa com um motivo (área 'content').
create or replace function public.admin_review_influencer_program(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can('content') then raise exception 'not_authorized'; end if;
  if p_approve then
    update public.influencer_programs
      set published = draft, published_at = now(), status = 'approved', review_note = null, updated_at = now()
      where id = p_id and status = 'review';
  else
    if length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'note_required'; end if;
    update public.influencer_programs
      set status = 'rejected', review_note = btrim(p_note), updated_at = now()
      where id = p_id and status = 'review';
  end if;
  if not found then raise exception 'program_not_found'; end if;
end;
$$;

revoke execute on function public.admin_set_influencer(uuid, boolean) from public, anon;
revoke execute on function public.admin_influencer_programs(text) from public, anon;
revoke execute on function public.admin_review_influencer_program(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_influencer(uuid, boolean) to authenticated;
grant execute on function public.admin_influencer_programs(text) to authenticated;
grant execute on function public.admin_review_influencer_program(uuid, boolean, text) to authenticated;
