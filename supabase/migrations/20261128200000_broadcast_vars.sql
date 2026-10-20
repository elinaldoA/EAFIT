-- Variáveis nos envios manuais e agendados (Comunicação → Enviar notificação):
-- {nome} (apelido ou primeiro nome), {treinos_mes} (dias treinados no mês, no
-- horário de Brasília) e {dias_sem_treinar} (desde o último treino; vazio para
-- quem nunca treinou). As Edge Functions admin-broadcast e
-- send-scheduled-broadcast trocam por pessoa (supabase/functions/_shared/broadcastVars.ts).

-- Interna (service role): valores de cada pessoa; p_users nulo = todos.
create or replace function public.ops_broadcast_vars(p_users uuid[] default null)
returns table (bv_user uuid, bv_nome text, bv_treinos_mes bigint, bv_dias_sem_treinar int)
language sql
stable
security definer
set search_path = public, auth
as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  us as (
    select u.id, u.raw_user_meta_data as md from auth.users u
    where p_users is null or u.id = any(p_users)
  ),
  td as (select t.user_id, t.day from public.training_days() t where t.user_id in (select id from us))
  select us.id,
         coalesce(nullif(btrim(us.md->>'apelido'), ''), nullif(split_part(btrim(coalesce(us.md->>'nome', '')), ' ', 1), '')),
         (select count(*) from td where td.user_id = us.id and td.day >= date_trunc('month', (select d from today))::date),
         (select (select d from today) - max(td.day) from td where td.user_id = us.id)
  from us;
$$;
revoke execute on function public.ops_broadcast_vars(uuid[]) from public, anon, authenticated;
grant execute on function public.ops_broadcast_vars(uuid[]) to service_role;

-- Prévia no painel com os valores de uma pessoa.
create or replace function public.admin_broadcast_vars(p_user uuid)
returns table (bv_user uuid, bv_nome text, bv_treinos_mes bigint, bv_dias_sem_treinar int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query select * from public.ops_broadcast_vars(array[p_user]);
end;
$$;
revoke execute on function public.admin_broadcast_vars(uuid) from public, anon;
grant execute on function public.admin_broadcast_vars(uuid) to authenticated;
