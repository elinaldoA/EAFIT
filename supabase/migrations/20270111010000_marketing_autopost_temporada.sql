-- Conteúdo de temporada na publicação automática: um item da fila pode ter um
-- tema (`season`, os mesmos de app-react/src/lib/season.js). Ele só sai enquanto
-- esse tema estiver no ar no app (app_settings, chave "season", período que
-- cobre o dia de hoje em Brasília) e, nesse período, passa na frente dos itens
-- comuns da mesma faixa. Fora da temporada ele espera na fila (não é pulado).
-- Itens sem tema seguem como antes. O painel prevê a agenda com a mesma regra
-- (app-admin/src/lib/marketing.js, autopostSchedule).

alter table public.marketing_autopost_queue add column if not exists season text;
alter table public.marketing_autopost_queue drop constraint if exists marketing_autopost_queue_season_check;
alter table public.marketing_autopost_queue add constraint marketing_autopost_queue_season_check
  check (season is null or season in ('carnaval', 'pascoa', 'namorados', 'festa_junina', 'outubro_rosa', 'halloween', 'novembro_azul', 'natal', 'ano_novo'));

-- Tema no ar hoje no app, ou null. Aceita também o formato antigo de um tema só
-- ({ enabled, theme, startsOn, endsOn }), como normalizeSeason no app.
create or replace function public.marketing_active_season(p_day date default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p->>'theme'
  from public.app_settings s,
    jsonb_array_elements(case when jsonb_typeof(s.value->'periods') = 'array' then s.value->'periods' else jsonb_build_array(s.value) end) p
  where s.key = 'season'
    and (s.value->>'enabled') = 'true'
    and p->>'theme' is not null
    and coalesce(p->>'startsOn', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and coalesce(p->>'endsOn', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and coalesce(p_day, (now() at time zone 'America/Sao_Paulo')::date) between (p->>'startsOn')::date and (p->>'endsOn')::date
  limit 1;
$$;

revoke execute on function public.marketing_active_season(date) from public, anon, authenticated;

create or replace function public.marketing_autopost_run(p_format text, p_slot text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.marketing_autopost_queue;
  v_accounts uuid[];
  v_post uuid;
  v_season text := public.marketing_active_season();
begin
  if not coalesce((select enabled from public.marketing_autopost_settings where id), false) then return null; end if;

  select array_agg(id) into v_accounts from public.marketing_accounts
  where status = 'ok' and platform in ('instagram', 'facebook', 'threads')
    and (p_format <> 'story' or platform <> 'threads');
  if coalesce(cardinality(v_accounts), 0) = 0 then return null; end if;

  loop
    -- Item da temporada no ar primeiro; item de outra temporada espera.
    select * into v_item from public.marketing_autopost_queue
    where posted_at is null and skipped_at is null and format = p_format and slot is not distinct from p_slot
      and (season is null or season = v_season)
    order by (season is not null) desc, position
    limit 1
    for update skip locked;
    if not found then return null; end if;

    -- Repetido: mesma mídia, ou mesma legenda (não vazia) de um post que não foi cancelado.
    if exists (
      select 1 from public.marketing_posts p
      where p.id is distinct from v_item.post_id
        and (
          p.media = v_item.media
          or (btrim(v_item.caption) <> '' and btrim(p.caption) = btrim(v_item.caption))
        )
        and not exists (
          select 1 from public.marketing_post_targets t
          where t.post_id = p.id
          having bool_and(t.status = 'canceled')
        )
    ) then
      update public.marketing_autopost_queue set skipped_at = now() where id = v_item.id;
      insert into public.admin_audit_log (admin_id, target_user_id, action, details)
      values (null, null, 'marketingAutopostSkip', jsonb_build_object('key', v_item.key, 'format', v_item.format, 'reason', 'repetido'));
      continue;
    end if;
    exit;
  end loop;

  -- Reel é post de feed com vídeo.
  insert into public.marketing_posts (caption, media, scheduled_at, created_by, format)
  values (v_item.caption, v_item.media, null, null, case when v_item.format = 'story' then 'story' else 'feed' end)
  returning id into v_post;

  insert into public.marketing_post_targets (post_id, account_id, run_after)
  select v_post, a, now() from unnest(v_accounts) a;

  update public.marketing_autopost_queue set post_id = v_post, posted_at = now() where id = v_item.id;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (null, null, 'marketingAutopost', jsonb_build_object(
    'post', v_post, 'key', v_item.key, 'format', v_item.format, 'slot', v_item.slot, 'season', v_item.season, 'accounts', cardinality(v_accounts)
  ));
  return v_post;
end;
$$;
