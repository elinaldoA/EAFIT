-- Dashboard → Localização:
--  1) admin_geo_resolve_now(): o admin pede uma rodada da Edge Function
--     resolve-geo na hora (o cron roda a cada 15 min, ver 20261105020000), pra
--     esvaziar a fila de IPs "aguardando localização". Só o banco tem o
--     cron_secret (Vault), por isso a chamada sai daqui, igual ao cron.
--  2) admin_user_geo_retention(): modo "Retenção" — por estado, contas, novas no
--     período, ativas no período e quantas das que já existiam antes do período
--     voltaram a abrir o app nele.

create or replace function public.admin_geo_resolve_now()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  req bigint;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/resolve-geo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  ) into req;
  return req;
end;
$$;

revoke execute on function public.admin_geo_resolve_now() from public, anon;
grant execute on function public.admin_geo_resolve_now() to authenticated;

create or replace function public.admin_user_geo_retention(days_back int default 30)
returns table (country text, uf text, total bigint, novas bigint, ativas bigint, antigas bigint, antigas_ativas bigint)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int := greatest(1, least(coalesce(days_back, 30), 366));
  since date := (now() at time zone 'America/Sao_Paulo')::date - (n - 1);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select uc.country, uc.uf,
           count(*)::bigint,
           count(*) filter (where c.created_on >= since)::bigint,
           count(*) filter (where uc.last_seen >= since)::bigint,
           count(*) filter (where c.created_on < since)::bigint,
           count(*) filter (where c.created_on < since and uc.last_seen >= since)::bigint
    from public.user_client uc
    join auth.users u on u.id = uc.user_id
    left join public.profiles p on p.id = uc.user_id
    cross join lateral (select (u.created_at at time zone 'America/Sao_Paulo')::date as created_on) c
    where uc.country is not null and not coalesce(p.is_admin, false)
    group by uc.country, uc.uf;
end;
$$;

revoke execute on function public.admin_user_geo_retention(int) from public, anon;
grant execute on function public.admin_user_geo_retention(int) to authenticated;
