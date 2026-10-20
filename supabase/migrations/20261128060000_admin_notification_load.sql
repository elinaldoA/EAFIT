-- Painel admin: carga de avisos por pessoa (Comunicação → Automáticas, card
-- "Limite por pessoa"). Quantas pessoas receberam 1, 2, 3… avisos (linhas da
-- central de avisos, manuais e automáticos) nos últimos 7 dias. Sem admins.
-- O limite em si fica em app_settings 'push_cap' ({ "maxPerWeek": n }) e é
-- aplicado por supabase/functions/send-engagement às automáticas.
create or replace function public.admin_notification_load()
returns table (nl_count int, nl_users bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with per_user as (
      select un.user_id, count(*)::int as n
      from public.user_notifications un
      left join public.profiles p on p.id = un.user_id
      where un.created_at >= now() - interval '7 days' and not coalesce(p.is_admin, false)
      group by un.user_id
    )
    select per_user.n, count(*)::bigint from per_user group by per_user.n order by per_user.n;
end;
$$;

revoke execute on function public.admin_notification_load() from public, anon;
grant execute on function public.admin_notification_load() to authenticated;
