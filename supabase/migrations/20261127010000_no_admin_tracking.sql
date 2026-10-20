-- Acessos de admin não contam nas métricas (Localização, Comportamento,
-- acessos ao app). Conta admin já não entra no app (lib/adminGuard.js), mas
-- uma sessão aberta antes de virar admin, ou chamada direta às funções, ainda
-- gravava. Aqui track_client e track_event ignoram admin e o que já foi
-- gravado por admins sai das tabelas.
--
-- Visitas anônimas (page_visits, auth_events, app_installs) não têm conta: o
-- navegador onde um admin entrou fica marcado (app-react/src/lib/staffDevice.js)
-- e para de enviá-las. As antigas não têm como ser separadas.

create or replace function public.track_event(p_event text, p_detail text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then return; end if;
  if p_event is null or p_event !~ '^[a-z0-9_]{1,30}$' then return; end if;
  if coalesce(p_detail, '') !~ '^[a-z0-9_-]{0,40}$' then return; end if;

  insert into public.user_events (user_id, event, detail)
  values (auth.uid(), p_event, coalesce(p_detail, ''))
  on conflict do nothing;
end;
$$;

revoke execute on function public.track_event(text, text) from public, anon;
grant execute on function public.track_event(text, text) to authenticated;

create or replace function public.track_client(
  p_os text, p_browser text, p_device text, p_display_mode text,
  p_app_version text, p_lang text, p_push_permission text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os text := case when p_os in ('android', 'ios', 'windows', 'mac', 'linux') then p_os else 'outro' end;
  v_browser text := case when p_browser in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera') then p_browser else 'outro' end;
  v_device text := case when p_device in ('celular', 'tablet') then p_device else 'desktop' end;
  v_mode text := case when p_display_mode = 'standalone' then 'standalone' else 'browser' end;
  v_version text := case when coalesce(p_app_version, '') ~ '^[0-9a-z.+-]{0,20}$' then coalesce(p_app_version, '') else '' end;
  v_lang text := case when p_lang in ('pt', 'en') then p_lang else 'outro' end;
  v_push text := case when p_push_permission in ('granted', 'denied', 'default') then p_push_permission else 'unsupported' end;
  v_ip inet := public.request_ip();
begin
  if auth.uid() is null or public.is_admin() then return; end if;

  insert into public.user_client as c
    (user_id, os, browser, device, display_mode, app_version, lang, push_permission, ip)
  values (auth.uid(), v_os, v_browser, v_device, v_mode, v_version, v_lang, v_push, v_ip)
  on conflict (user_id) do update set
    os = excluded.os, browser = excluded.browser, device = excluded.device,
    display_mode = excluded.display_mode, app_version = excluded.app_version,
    lang = excluded.lang, push_permission = excluded.push_permission,
    ip = coalesce(excluded.ip, c.ip),
    geo_at = case when excluded.ip is not null and excluded.ip is distinct from c.ip then null else c.geo_at end,
    last_seen = (now() at time zone 'America/Sao_Paulo')::date, updated_at = now();

  insert into public.app_access_days (user_id, ip)
  values (auth.uid(), v_ip)
  on conflict (user_id, day) do update set ip = excluded.ip
    where app_access_days.ip is null and excluded.ip is not null;
end;
$$;

revoke execute on function public.track_client(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.track_client(text, text, text, text, text, text, text) to authenticated;

-- O que admins já gravaram.
delete from public.app_access_days d using public.profiles p where p.id = d.user_id and p.is_admin;
delete from public.user_client c using public.profiles p where p.id = c.user_id and p.is_admin;
delete from public.user_events e using public.profiles p where p.id = e.user_id and p.is_admin;
delete from public.app_installs i using public.profiles p where p.id = i.user_id and p.is_admin;
