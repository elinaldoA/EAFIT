-- Pesquisa de inatividade ("por que você parou?"), enviada pelo e-mail semanal
-- (Edge Function send-weekly-emails) a quem passou das 4 semanas sem treinar.
-- Cada linha é um envio; a resposta (motivo em um toque no e-mail, comentário
-- opcional na tela do app) é gravada depois, na mesma linha, pela Edge
-- Function inactivity-reason.
--
--   segment  absent = sumiu do app (sem acesso há 30 dias ou mais)
--            idle   = continua entrando, mas não treina
--
-- A regra de quem recebe fica em supabase/functions/_shared/weeklyEmails.ts;
-- aqui o banco só entrega o estado de cada conta (email_inactivity_state) e
-- guarda envios e respostas.
-- Em funções com RETURNS TABLE as colunas de saída viram variáveis plpgsql:
-- colunas de tabela são sempre qualificadas com alias.

create table if not exists public.inactivity_surveys (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  segment text not null check (segment in ('absent', 'idle')),
  days_inactive int not null check (days_inactive >= 0),
  never_trained boolean not null default false,
  sent_at timestamptz not null default now(),
  reason text check (reason is null or reason in
    ('sem_tempo', 'treino', 'app_dificil', 'outro_app', 'saude', 'pausa', 'outro')),
  comment text check (comment is null or length(comment) <= 500),
  answered_at timestamptz
);

create index if not exists inactivity_surveys_user_idx on public.inactivity_surveys (user_id, sent_at desc);
create index if not exists inactivity_surveys_answered_idx on public.inactivity_surveys (answered_at desc)
  where answered_at is not null;

alter table public.inactivity_surveys enable row level security;

drop policy if exists "admin reads inactivity surveys" on public.inactivity_surveys;
create policy "admin reads inactivity surveys" on public.inactivity_surveys
  for select using (public.is_admin());

-- Ninguém escreve pelo app: só as Edge Functions (service role).
revoke all on public.inactivity_surveys from anon, authenticated;
grant select on public.inactivity_surveys to authenticated;
grant select, insert, update on public.inactivity_surveys to service_role;

-- ---------------------------------------------------------------------------
-- Estado de cada conta pro e-mail semanal: último treino concluído, último
-- acesso conhecido e última pesquisa enviada (datas em Brasília).
-- "Último acesso" junta o login (last_sign_in_at, que não muda enquanto a
-- sessão é só renovada) com o que o app registra a cada abertura
-- (user_client.last_seen e user_events).
-- ---------------------------------------------------------------------------
create or replace function public.email_inactivity_state()
returns table (st_user uuid, st_last_workout date, st_last_seen date, st_last_asked date)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id,
         (select max(w.workout_date) from public.workouts w
          where w.user_id = u.id and w.completed
            and w.workout_date <= (now() at time zone 'America/Sao_Paulo')::date),
         greatest(
           (u.last_sign_in_at at time zone 'America/Sao_Paulo')::date,
           uc.last_seen,
           (select max(e.day) from public.user_events e where e.user_id = u.id)
         ),
         (select max((s.sent_at at time zone 'America/Sao_Paulo')::date)
          from public.inactivity_surveys s where s.user_id = u.id)
  from auth.users u
  left join public.user_client uc on uc.user_id = u.id
  order by u.id;
$$;

revoke execute on function public.email_inactivity_state() from public, anon, authenticated;
grant execute on function public.email_inactivity_state() to service_role;

-- ---------------------------------------------------------------------------
-- Painel admin (Acompanhamento → Por que pararam)
-- ---------------------------------------------------------------------------
-- Envios por segmento e motivo; is_reason = '' são os que ainda não responderam.
create or replace function public.admin_inactivity_summary()
returns table (is_segment text, is_reason text, is_total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select s.segment, coalesce(s.reason, ''), count(*)::bigint
    from public.inactivity_surveys s
    group by s.segment, coalesce(s.reason, '');
end;
$$;

revoke execute on function public.admin_inactivity_summary() from public, anon;
grant execute on function public.admin_inactivity_summary() to authenticated;

-- Respostas mais recentes, com quem respondeu.
create or replace function public.admin_inactivity_answers(max_rows int default 100)
returns table (
  ia_id bigint, ia_user uuid, ia_email text, ia_name text, ia_segment text, ia_reason text,
  ia_comment text, ia_days int, ia_never_trained boolean, ia_answered timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select s.id, s.user_id, u.email::text,
           coalesce(nullif(u.raw_user_meta_data->>'apelido', ''), u.raw_user_meta_data->>'nome'),
           s.segment, s.reason, s.comment, s.days_inactive, s.never_trained, s.answered_at
    from public.inactivity_surveys s
    join auth.users u on u.id = s.user_id
    where s.answered_at is not null
    order by s.answered_at desc
    limit greatest(1, least(coalesce(max_rows, 100), 500));
end;
$$;

revoke execute on function public.admin_inactivity_answers(int) from public, anon;
grant execute on function public.admin_inactivity_answers(int) to authenticated;
