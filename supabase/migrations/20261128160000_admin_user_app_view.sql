-- "Visão do app" no detalhe do usuário (aba só de leitura): o que o app mostra
-- para a pessoa agora — variantes de experimento, pesquisa pendente, caixa de
-- notificações e dias treinados na semana. Cada abertura fica no registro de
-- auditoria (action 'viewAsUser'). Treino do dia, aviso e tema são montados no
-- painel com os dados que ele já lê (plano ativo e app_settings).

create or replace function public.admin_user_app_view(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  week0 date := today - extract(dow from today)::int;
  out jsonb;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'user_not_found'; end if;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), p_user, 'viewAsUser', null);

  select jsonb_build_object(
    'experiments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', e.key, 'name', e.name, 'flag', e.flag,
        'variant', public.experiment_pick(e.variants, public.experiment_bucket(e.key, p_user))
      ) order by e.key)
      from public.experiments e
      where e.status = 'rodando' and public.audience_match(e.audience, p_user)
    ), '[]'::jsonb),
    'survey', (
      select jsonb_build_object('question', s.question, 'kind', s.kind)
      from public.surveys s
      where s.active
        and (s.starts_on is null or s.starts_on <= today)
        and (s.ends_on is null or s.ends_on >= today)
        and not exists (select 1 from public.survey_answers a where a.survey_id = s.id and a.user_id = p_user)
        and public.survey_eligible(s, p_user)
      order by s.created_at
      limit 1
    ),
    'unread', (select count(*) from public.user_notifications n where n.user_id = p_user and n.read_at is null),
    'inbox', coalesce((
      select jsonb_agg(jsonb_build_object('kind', n.kind, 'title', n.title, 'body', n.body, 'created_at', n.created_at, 'read_at', n.read_at)
                       order by n.created_at desc)
      from (select * from public.user_notifications where user_id = p_user order by created_at desc limit 10) n
    ), '[]'::jsonb),
    'week_days', (select count(*) from public.training_days() t where t.user_id = p_user and t.day between week0 and today),
    'last_day', (select max(t.day) from public.training_days() t where t.user_id = p_user)
  ) into out;
  return out;
end;
$$;

revoke execute on function public.admin_user_app_view(uuid) from public, anon;
grant execute on function public.admin_user_app_view(uuid) to authenticated;
