-- Painel admin, segunda leva: fotos de progresso no Storage, pendências no
-- menu, novo aceite dos termos, desafio oficial visível no app, filtros na
-- auditoria, limpeza de dados antigos, vínculo personal-aluno e amizades.
--
-- Colunas de saída prefixadas: em RETURNS TABLE elas viram variáveis plpgsql.

-- ---------------------------------------------------------------------------
-- Fotos de progresso: as novas ficam no bucket privado progress-photos e o
-- admin não tinha leitura (só o dono e o personal). Sem isto o detalhe do
-- usuário no painel não consegue assinar a URL da foto.
-- ---------------------------------------------------------------------------
drop policy if exists "progress_photos_admin_select" on storage.objects;
create policy "progress_photos_admin_select"
  on storage.objects for select
  using (bucket_id = 'progress-photos' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Pendências que pedem atenção do admin (contadores do menu e do Dashboard).
-- ---------------------------------------------------------------------------
create or replace function public.admin_attention_counts()
returns table (at_feedback bigint, at_pain bigint, at_errors bigint, at_overdue bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select
      (select count(*) from public.feedback f where f.status = 'novo'),
      (select count(*) from public.exercise_discomfort d
        where d.severity in ('forte', 'lesao')
          and d.log_date >= (now() at time zone 'America/Sao_Paulo')::date - 6),
      (select count(*) from public.client_errors e where e.created_at > now() - interval '24 hours'),
      (select count(*) from public.scheduled_broadcasts b
        where b.sent_at is null and b.scheduled_at < now() - interval '10 minutes');
end;
$$;

-- ---------------------------------------------------------------------------
-- Novo aceite dos termos: data da mudança mais recente já em vigor (Termos ou
-- Privacidade). O app compara com a data do aceite da pessoa e, se ela aceitou
-- antes, pede para aceitar de novo. Sem versão registrada, devolve null.
-- ---------------------------------------------------------------------------
create or replace function public.current_legal_date()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select max(l.effective_date)
  from public.legal_versions l
  where l.effective_date <= (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ---------------------------------------------------------------------------
-- Desafios oficiais abertos em que a pessoa ainda não entrou (o app lista e
-- oferece "Participar"; a entrada continua sendo join_challenge pelo código).
-- ---------------------------------------------------------------------------
create or replace function public.official_challenges()
returns table (oc_id uuid, oc_title text, oc_code text, oc_start date, oc_end date, oc_members bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.invite_code, c.start_date, c.end_date,
         (select count(*) from public.challenge_members m where m.challenge_id = c.id and m.role = 'member')
  from public.challenges c
  where c.is_official
    and c.end_date >= (now() at time zone 'America/Sao_Paulo')::date
    and auth.uid() is not null
    and not exists (select 1 from public.challenge_members m
                    where m.challenge_id = c.id and m.user_id = auth.uid())
  order by c.start_date, c.created_at
  limit 10;
$$;

-- ---------------------------------------------------------------------------
-- Auditoria com filtros: por ação e por e-mail (do admin ou do alvo).
-- ---------------------------------------------------------------------------
create or replace function public.admin_search_audit_log(
  page_size int default 50,
  page_offset int default 0,
  p_action text default null,
  p_search text default null
)
returns table (
  id uuid, created_at timestamptz, admin_email text, target_email text,
  action text, details jsonb, total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select l.id, l.created_at, a.email::text, t.email::text, l.action, l.details,
           count(*) over()::bigint
    from public.admin_audit_log l
    left join auth.users a on a.id = l.admin_id
    left join auth.users t on t.id = l.target_user_id
    where (p_action is null or l.action = p_action)
      and (v_search is null
           or position(lower(v_search) in lower(coalesce(a.email::text, ''))) > 0
           or position(lower(v_search) in lower(coalesce(t.email::text, ''))) > 0)
    order by l.created_at desc
    limit least(greatest(coalesce(page_size, 50), 1), 200) offset greatest(coalesce(page_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Limpeza de dados técnicos antigos (métricas e controle de envio). Não toca
-- em nada que o usuário criou. Mínimo de 30 dias para não apagar o que as
-- análises e o intervalo entre notificações ainda usam.
--   page_visits       visitas anônimas à landing / tela de acesso
--   auth_events       eventos anônimos da tela de acesso
--   user_events       telas e funcionalidades abertas por usuário
--   notification_log  controle das notificações automáticas enviadas
--   client_errors     erros do navegador
-- ---------------------------------------------------------------------------
create or replace function public.admin_purge_stats(p_days int default 180)
returns table (pg_kind text, pg_total bigint, pg_old bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n int := greatest(coalesce(p_days, 180), 30);
  cut_date date := (now() at time zone 'America/Sao_Paulo')::date - n;
  cut_ts timestamptz := now() - make_interval(days => n);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select 'page_visits'::text, count(*)::bigint, count(*) filter (where v.visited_on < cut_date)::bigint from public.page_visits v
    union all
    select 'auth_events'::text, count(*)::bigint, count(*) filter (where e.visited_on < cut_date)::bigint from public.auth_events e
    union all
    select 'user_events'::text, count(*)::bigint, count(*) filter (where e.day < cut_date)::bigint from public.user_events e
    union all
    select 'notification_log'::text, count(*)::bigint, count(*) filter (where l.created_at < cut_ts)::bigint from public.notification_log l
    union all
    select 'client_errors'::text, count(*)::bigint, count(*) filter (where c.created_at < cut_ts)::bigint from public.client_errors c;
end;
$$;

create or replace function public.admin_purge_old(p_kind text, p_days int default 180)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := greatest(coalesce(p_days, 180), 30);
  cut_date date := (now() at time zone 'America/Sao_Paulo')::date - n;
  cut_ts timestamptz := now() - make_interval(days => n);
  removed bigint;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  if p_kind = 'page_visits' then
    delete from public.page_visits v where v.visited_on < cut_date;
  elsif p_kind = 'auth_events' then
    delete from public.auth_events e where e.visited_on < cut_date;
  elsif p_kind = 'user_events' then
    delete from public.user_events e where e.day < cut_date;
  elsif p_kind = 'notification_log' then
    delete from public.notification_log l where l.created_at < cut_ts;
  elsif p_kind = 'client_errors' then
    delete from public.client_errors c where c.created_at < cut_ts;
  else
    raise exception 'invalid_kind';
  end if;
  get diagnostics removed = row_count;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'purgeOldData', jsonb_build_object('kind', p_kind, 'days', n, 'removed', removed));
  return removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Encerrar o vínculo entre um personal e um aluno (mesmo efeito de o aluno
-- encerrar pelo app: status revoked).
-- ---------------------------------------------------------------------------
create or replace function public.admin_revoke_trainer_link(p_trainer uuid, p_client uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  update public.trainer_clients tc set status = 'revoked', revoked_at = now()
  where tc.trainer_id = p_trainer and tc.client_id = p_client and tc.status = 'active';
  if not found then raise exception 'not_found'; end if;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), p_client, 'revokeTrainerLink', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Amizades de um usuário (aceitas e pendentes) e remoção pelo admin.
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_friendships(p_user uuid)
returns table (uf_id bigint, uf_other uuid, uf_email text, uf_name text, uf_status text, uf_since timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select f.id, u.id, u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''),
                    nullif(btrim(u.raw_user_meta_data->>'nome'), ''),
                    split_part(u.email::text, '@', 1)),
           case when f.status = 'accepted' then 'friend'
                when f.requester_id = p_user then 'outgoing'
                else 'incoming' end,
           f.created_at
    from public.friendships f
    join auth.users u on u.id = case when f.requester_id = p_user then f.addressee_id else f.requester_id end
    where f.requester_id = p_user or f.addressee_id = p_user
    order by f.created_at desc;
end;
$$;

create or replace function public.admin_remove_friendship(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  delete from public.friendships f where f.id = p_id
  returning f.requester_id, f.addressee_id into v_a, v_b;
  if v_a is null then raise exception 'not_found'; end if;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), v_a, 'removeFriendship', null);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_attention_counts()', 'current_legal_date()', 'official_challenges()',
    'admin_search_audit_log(int, int, text, text)',
    'admin_purge_stats(int)', 'admin_purge_old(text, int)',
    'admin_revoke_trainer_link(uuid, uuid)', 'admin_user_friendships(uuid)', 'admin_remove_friendship(bigint)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
