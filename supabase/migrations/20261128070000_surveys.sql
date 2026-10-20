-- Pesquisas dentro do app (NPS, escolha ou texto), criadas no painel
-- (Acompanhamento → Pesquisas). O app pergunta uma de cada vez, no Treino,
-- a quem está no público e ainda não respondeu; "Agora não" fica guardado no
-- aparelho (lib/surveys.js no app).
--
-- Públicos: todos | ativos (treinou nos últimos 30 dias) | novos (conta com
-- até 30 dias) | personal (aluno vinculado a um personal) | academia | casa
-- (local do perfil; sem valor = academia). min_account_days evita perguntar a
-- quem acabou de chegar.

create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('nps', 'escolha', 'texto')),
  question text not null check (char_length(btrim(question)) between 3 and 200),
  question_en text check (question_en is null or char_length(question_en) <= 200),
  options text[] not null default '{}' check (cardinality(options) <= 6),
  audience text not null default 'todos' check (audience in ('todos', 'ativos', 'novos', 'personal', 'academia', 'casa')),
  min_account_days int not null default 7 check (min_account_days between 0 and 365),
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'escolha' or cardinality(options) >= 2),
  check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create table if not exists public.survey_answers (
  id bigint generated always as identity primary key,
  survey_id uuid not null references public.surveys(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score smallint check (score between 0 and 10),
  choice text check (choice is null or char_length(choice) <= 80),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (survey_id, user_id)
);

create index if not exists survey_answers_user_idx on public.survey_answers (user_id);

alter table public.surveys enable row level security;
alter table public.survey_answers enable row level security;

drop policy if exists "admin reads surveys" on public.surveys;
create policy "admin reads surveys" on public.surveys for select using (public.is_admin());
drop policy if exists "admin writes surveys" on public.surveys;
create policy "admin writes surveys" on public.surveys for all
  using (public.admin_can('content')) with check (public.admin_can('content'));

drop policy if exists "admin reads survey answers" on public.survey_answers;
create policy "admin reads survey answers" on public.survey_answers for select using (public.is_admin());

-- O aluno não lê nem grava as tabelas direto: só pelas funções abaixo.
revoke all on public.survey_answers from anon, authenticated;
grant select on public.survey_answers to authenticated;
revoke all on public.surveys from anon;

-- A pessoa está no público da pesquisa? Uso interno.
create or replace function public.survey_eligible(p_survey public.surveys, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = p_user
      and not coalesce(p.is_admin, false)
      and u.created_at <= now() - make_interval(days => p_survey.min_account_days)
      and case p_survey.audience
        when 'todos' then true
        when 'novos' then u.created_at >= now() - interval '30 days'
        when 'ativos' then exists (select 1 from public.training_days() t
                                    where t.user_id = u.id and t.day > (now() at time zone 'America/Sao_Paulo')::date - 30)
        when 'personal' then exists (select 1 from public.trainer_clients c where c.client_id = u.id and c.status = 'active')
        when 'casa' then u.raw_user_meta_data->>'local' = 'casa'
        when 'academia' then coalesce(u.raw_user_meta_data->>'local', '') <> 'casa'
        else false
      end
  );
$$;
revoke execute on function public.survey_eligible(public.surveys, uuid) from public, anon, authenticated;

-- A pesquisa que o app deve mostrar agora (a mais antiga em andamento), ou nada.
create or replace function public.my_pending_survey()
returns table (id uuid, kind text, question text, question_en text, options text[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then return; end if;
  return query
    select s.id, s.kind, s.question, s.question_en, s.options
    from public.surveys s
    where s.active
      and (s.starts_on is null or s.starts_on <= today)
      and (s.ends_on is null or s.ends_on >= today)
      and not exists (select 1 from public.survey_answers a where a.survey_id = s.id and a.user_id = auth.uid())
      and public.survey_eligible(s, auth.uid())
    order by s.created_at
    limit 1;
end;
$$;

revoke execute on function public.my_pending_survey() from public, anon;
grant execute on function public.my_pending_survey() to authenticated;

-- Grava a resposta (uma por pessoa e pesquisa). Recusa o que não combina com o
-- tipo da pesquisa ou com o público.
create or replace function public.answer_survey(p_survey uuid, p_score int default null, p_choice text default null, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.surveys;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  c text := nullif(left(btrim(coalesce(p_comment, '')), 500), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into s from public.surveys where surveys.id = p_survey;
  if not found or not s.active
     or (s.starts_on is not null and s.starts_on > today)
     or (s.ends_on is not null and s.ends_on < today) then
    raise exception 'survey_closed';
  end if;
  if not public.survey_eligible(s, auth.uid()) then raise exception 'not_eligible'; end if;

  if s.kind = 'nps' and (p_score is null or p_score not between 0 and 10) then raise exception 'invalid_answer'; end if;
  if s.kind = 'escolha' and (p_choice is null or not (p_choice = any (s.options))) then raise exception 'invalid_answer'; end if;
  if s.kind = 'texto' and c is null then raise exception 'invalid_answer'; end if;

  insert into public.survey_answers (survey_id, user_id, score, choice, comment)
  values (s.id, auth.uid(), case when s.kind = 'nps' then p_score end, case when s.kind = 'escolha' then p_choice end, c)
  on conflict (survey_id, user_id) do nothing;
end;
$$;

revoke execute on function public.answer_survey(uuid, int, text, text) from public, anon;
grant execute on function public.answer_survey(uuid, int, text, text) to authenticated;

-- Painel: respostas de uma pesquisa com o perfil de quem respondeu, para o
-- recorte por segmento (objetivo, nível, local, personal, tempo de conta,
-- treinou nos últimos 30 dias).
create or replace function public.admin_survey_answers(p_survey uuid)
returns table (
  sa_id bigint, sa_user uuid, sa_name text, sa_email text, sa_score smallint, sa_choice text, sa_comment text,
  sa_at timestamptz, sa_meta text, sa_nivel text, sa_local text, sa_personal boolean, sa_account_days int, sa_active30 boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select a.id, a.user_id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), u.email::text),
           u.email::text, a.score, a.choice, a.comment, a.created_at,
           coalesce(nullif(u.raw_user_meta_data->>'meta', ''), 'não informado'),
           coalesce(nullif(u.raw_user_meta_data->>'nivel', ''), 'não informado'),
           case when u.raw_user_meta_data->>'local' = 'casa' then 'casa' else 'academia' end,
           exists (select 1 from public.trainer_clients c where c.client_id = u.id and c.status = 'active'),
           (a.created_at::date - u.created_at::date)::int,
           exists (select 1 from public.training_days() t where t.user_id = u.id and t.day > today - 30)
    from public.survey_answers a
    join auth.users u on u.id = a.user_id
    where a.survey_id = p_survey
    order by a.created_at desc;
end;
$$;

-- Lista de pesquisas com o total de respostas.
create or replace function public.admin_surveys()
returns table (
  sv_id uuid, sv_kind text, sv_question text, sv_question_en text, sv_options text[], sv_audience text,
  sv_min_account_days int, sv_starts_on date, sv_ends_on date, sv_active boolean, sv_created_at timestamptz,
  sv_answers bigint, sv_last_answer timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
    select s.id, s.kind, s.question, s.question_en, s.options, s.audience, s.min_account_days,
           s.starts_on, s.ends_on, s.active, s.created_at,
           (select count(*) from public.survey_answers a where a.survey_id = s.id),
           (select max(a.created_at) from public.survey_answers a where a.survey_id = s.id)
    from public.surveys s
    order by s.created_at desc;
end;
$$;

revoke execute on function public.admin_survey_answers(uuid) from public, anon;
revoke execute on function public.admin_surveys() from public, anon;
grant execute on function public.admin_survey_answers(uuid) to authenticated;
grant execute on function public.admin_surveys() to authenticated;

-- Backup do próprio usuário (Perfil → Exportar dados): as respostas com a
-- pergunta, já que o aluno não lê a tabela de pesquisas.
create or replace function public.my_survey_answers()
returns table (question text, kind text, score smallint, choice text, comment text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.question, s.kind, a.score, a.choice, a.comment, a.created_at
  from public.survey_answers a
  join public.surveys s on s.id = a.survey_id
  where a.user_id = auth.uid()
  order by a.created_at;
$$;

revoke execute on function public.my_survey_answers() from public, anon;
grant execute on function public.my_survey_answers() to authenticated;
