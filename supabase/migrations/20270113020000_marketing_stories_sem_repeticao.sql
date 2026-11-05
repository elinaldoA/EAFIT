-- Stories sem o mesmo roteiro todo dia.
--
-- 1. A fila repetia o tema em formatos seguidos: feed e Reel "treino" num dia,
--    story "treino" no outro. Agora marketing_autopost_run deixa para depois o item
--    cujo tema (a chave sem -feed/-reel/-story) saiu em qualquer formato nos últimos
--    3 dias. Ele não é pulado: sai quando o tema esfriar ou quando não houver outro.
--    A agenda do painel simula a mesma regra (autopostSchedule, marketing.js).
-- 2. A série programada à mão em 02/11 alternava os mesmos dois stories ("Bom dia,
--    vamos treinar" às 6h30 e "Lembrete beba água" às 15h) até 30/11, em cima dos
--    stories de café e de hidratação da fila. Os pendentes são cancelados.

-- Tema de um item da fila: "treino-feed" → "treino". Chave sem formato no fim é o próprio tema.
create or replace function public.marketing_autopost_theme(p_key text)
returns text
language sql
immutable
set search_path = public
as $$ select regexp_replace(coalesce(p_key, ''), '-(feed|reel|story)$', '') $$;

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
  where status = 'ok' and platform in ('instagram', 'facebook');
  if coalesce(cardinality(v_accounts), 0) = 0 then return null; end if;

  loop
    -- Item da temporada no ar primeiro; item de outra temporada espera.
    select * into v_item from public.marketing_autopost_queue
    where posted_at is null and skipped_at is null and format = p_format and slot is not distinct from p_slot
      and (season is null or season = v_season)
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

-- 2. Série repetida programada à mão.
update public.marketing_post_targets t
set status = 'canceled', error = 'Cancelado: story repetido (mesmo roteiro todo dia); a fila automática já tem café e hidratação.', updated_at = now()
from public.marketing_posts p
where p.id = t.post_id and t.status = 'pending' and p.format = 'story'
  and (p.media -> 0 ->> 'url' like '%story-bom-dia-vamos-treinar.png' or p.media -> 0 ->> 'url' like '%story-lembrete-beba-agua.png');
