-- Marketing: o autopost passa a enviar também ao TikTok os itens de feed e reel que são um único vídeo (story e
-- carrossel não existem lá). O app do TikTok ainda não foi auditado, então a Edge Function posta como privado
-- (SELF_ONLY) e o vídeo é aprovado/publicado manualmente no TikTok. A conta do TikTok precisa estar privada no app.
-- Facebook já recebia (a função escolhe Instagram e Facebook); nada muda para ele.
-- Mantém a reserva do foco da migration 20270306090000.

create or replace function public.marketing_autopost_run(p_format text, p_slot text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item public.marketing_autopost_queue;
  v_accounts uuid[];
  v_post uuid;
  v_season text := public.marketing_active_season();
  v_focus text := (select focus_module from public.marketing_autopost_settings where id);
  v_tt uuid[];
  v_pass int := 0; -- 0 = com o foco; 1 = reserva (faixa sem item da campanha: sai o conteúdo normal)
begin
  if not coalesce((select enabled from public.marketing_autopost_settings where id), false) then return null; end if;

  select array_agg(id) into v_accounts from public.marketing_accounts
  where status = 'ok' and platform in ('instagram', 'facebook');
  if coalesce(cardinality(v_accounts), 0) = 0 then return null; end if;

  loop
    -- Item da temporada no ar primeiro; item de outra temporada espera. Item que depende de um
    -- módulo só sai com o módulo ligado; item "Em breve" some quando o módulo liga.
    select * into v_item from public.marketing_autopost_queue
    where posted_at is null and skipped_at is null and format = p_format and slot is not distinct from p_slot
      and (season is null or season = v_season)
      and (requires_module is null or public.marketing_module_on(requires_module))
      -- Foco total: com focus_module definido, só sai conteúdo daquela campanha (lançamento e "Em breve"),
      -- esteja o módulo ligado ou não, e as faixas que esgotam ficam em silêncio até o foco ser desligado.
      and (v_focus is null or v_pass = 1 or requires_module = v_focus or hide_when_module = v_focus)
      and (hide_when_module is null or not public.marketing_module_on(hide_when_module))
      -- Foco na campanha: enquanto houver item de módulo ligado pendente neste formato, só ele sai
      -- (os demais, inclusive os stories de bom dia, treino, café e água, esperam). Esgotou o formato,
      -- o conteúdo normal volta sozinho.
      and (requires_module is not null or not exists (
        select 1 from public.marketing_autopost_queue c
        where c.requires_module is not null and public.marketing_module_on(c.requires_module)
          and c.posted_at is null and c.skipped_at is null and c.format = p_format
          and (c.season is null or c.season = v_season)
      ))
    -- Tema que saiu em qualquer formato nos últimos 3 dias vai para o fim da vez
    -- (feed "treino" ontem não vira story "treino" hoje); só sai se não houver outro.
    order by exists (
        select 1 from public.marketing_autopost_queue q
        where q.posted_at > now() - interval '3 days'
          and public.marketing_autopost_theme(q.key) = public.marketing_autopost_theme(marketing_autopost_queue.key)
      ),
      (season is not null) desc, position
    limit 1
    for update skip locked;
    if not found then
      -- Reserva: a faixa esgotou a campanha em foco; refaz a busca sem o foco (só o que nunca saiu nem foi pulado).
      if v_focus is not null and v_pass = 0 then v_pass := 1; continue; end if;
      return null;
    end if;

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

  -- TikTok: só feed/reel com um único vídeo (não tem story nem carrossel). Enquanto o app do TikTok não for auditado a
  -- Edge Function posta como privado (SELF_ONLY) e a aprovação é manual no próprio TikTok.
  if v_item.format <> 'story' and jsonb_typeof(v_item.media) = 'array' and jsonb_array_length(v_item.media) = 1
     and v_item.media->0->>'type' = 'video' then
    select array_agg(id) into v_tt from public.marketing_accounts where status = 'ok' and platform = 'tiktok';
    v_accounts := v_accounts || coalesce(v_tt, '{}'::uuid[]);
  end if;

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
$function$;
