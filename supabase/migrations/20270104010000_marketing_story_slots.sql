-- Marketing: stories de nutrição nos horários das refeições e stories com música.
--
--   1. A fila ganha `slot` (cafe | almoco | jantar | ceia) nos itens de story.
--      Cada horário de refeição tem a sua faixa, e o cron publica um item por dia:
--        café da manhã  7h      almoço  11h30      jantar  18h      ceia  21h30   (Brasília)
--      O story geral continua às 19h, o feed às 12h e o Reel às 17h.
--   2. Os stories viram vídeo de 8 s com a trilha original (a API do Instagram não
--      deixa pôr música em story de imagem): 16 de nutrição (4 por refeição) e os 6
--      gerais que ainda não saíram trocam a imagem pelo vídeo.
--   3. O editor da fila (marketing_autopost_add / _move) entende o horário de refeição.
--      Story de nutrição vai ao Instagram e ao Facebook; o Threads não tem story.

alter table public.marketing_autopost_queue add column if not exists slot text
  check (slot is null or slot in ('cafe', 'almoco', 'jantar', 'ceia'));
alter table public.marketing_autopost_queue drop constraint if exists marketing_autopost_queue_slot_story_only;
alter table public.marketing_autopost_queue add constraint marketing_autopost_queue_slot_story_only
  check (slot is null or format = 'story');

drop index if exists public.marketing_autopost_queue_next_idx;
create index marketing_autopost_queue_next_idx
  on public.marketing_autopost_queue (format, slot, position) where posted_at is null and skipped_at is null;

-- Publica o próximo item da faixa (formato + horário de refeição). Só o cron chama.
drop function if exists public.marketing_autopost_run(text);
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
begin
  if not coalesce((select enabled from public.marketing_autopost_settings where id), false) then return null; end if;

  select array_agg(id) into v_accounts from public.marketing_accounts
  where status = 'ok' and platform in ('instagram', 'facebook', 'threads')
    and (p_format <> 'story' or platform <> 'threads');
  if coalesce(cardinality(v_accounts), 0) = 0 then return null; end if;

  loop
    select * into v_item from public.marketing_autopost_queue
    where posted_at is null and skipped_at is null and format = p_format and slot is not distinct from p_slot
    order by position
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
    'post', v_post, 'key', v_item.key, 'format', v_item.format, 'slot', v_item.slot, 'accounts', cardinality(v_accounts)
  ));
  return v_post;
end;
$$;
revoke execute on function public.marketing_autopost_run(text, text) from public, anon, authenticated;

-- Sobe ou desce um item entre os pendentes da mesma faixa (formato + horário de refeição).
create or replace function public.marketing_autopost_move(p_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.marketing_autopost_queue;
  v_other public.marketing_autopost_queue;
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  if p_direction not in ('up', 'down') then raise exception 'invalid_direction'; end if;
  select * into v_item from public.marketing_autopost_queue where id = p_id and posted_at is null and skipped_at is null for update;
  if not found then raise exception 'not_found'; end if;

  select * into v_other from public.marketing_autopost_queue
  where format = v_item.format and slot is not distinct from v_item.slot and posted_at is null and skipped_at is null
    and ((p_direction = 'up' and position < v_item.position) or (p_direction = 'down' and position > v_item.position))
  order by case when p_direction = 'up' then -position else position end
  limit 1
  for update;
  if not found then return; end if; -- já é o primeiro/último

  update public.marketing_autopost_queue set position = v_other.position where id = v_item.id;
  update public.marketing_autopost_queue set position = v_item.position where id = v_other.id;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingAutopostEdit', jsonb_build_object('key', v_item.key, 'action', 'move', 'direction', p_direction));
end;
$$;
revoke execute on function public.marketing_autopost_move(uuid, text) from public, anon;
grant execute on function public.marketing_autopost_move(uuid, text) to authenticated;

-- Adiciona um item ao fim da fila (mesmas regras do painel de publicar). `p_slot`
-- só vale para story: horário de refeição em que ele sai.
drop function if exists public.marketing_autopost_add(text, text, jsonb);
create or replace function public.marketing_autopost_add(p_format text, p_caption text, p_media jsonb, p_slot text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := coalesce(jsonb_array_length(p_media), 0);
  v_videos int;
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  if p_format not in ('feed', 'reel', 'story') then raise exception 'invalid_format'; end if;
  if p_slot is not null and (p_format <> 'story' or p_slot not in ('cafe', 'almoco', 'jantar', 'ceia')) then raise exception 'invalid_slot'; end if;
  if jsonb_typeof(p_media) is distinct from 'array' or v_count < 1 or v_count > 10 then raise exception 'invalid_media'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_media) m
    where m ->> 'type' not in ('image', 'video') or coalesce(m ->> 'url', '') !~ '^https://'
  ) then raise exception 'invalid_media'; end if;
  select count(*) into v_videos from jsonb_array_elements(p_media) m where m ->> 'type' = 'video';
  if v_videos > 1 or (v_videos = 1 and v_count > 1) then raise exception 'video_alone'; end if;
  if p_format = 'reel' and (v_videos <> 1) then raise exception 'reel_needs_video'; end if;
  if p_format = 'story' and v_count <> 1 then raise exception 'story_needs_one_media'; end if;
  if char_length(coalesce(p_caption, '')) > 5000 then raise exception 'caption_too_long'; end if;
  if p_format <> 'story' and btrim(coalesce(p_caption, '')) = '' then raise exception 'caption_required'; end if;

  insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
  values (
    (select coalesce(max(position), 0) + 1 from public.marketing_autopost_queue),
    'manual-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
    p_format,
    case when p_format = 'story' then p_slot end,
    case when p_format = 'story' then '' else p_caption end,
    p_media
  )
  returning id into v_id;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingAutopostEdit', jsonb_build_object('action', 'add', 'format', p_format, 'slot', p_slot, 'id', v_id));
  return v_id;
end;
$$;
revoke execute on function public.marketing_autopost_add(text, text, jsonb, text) from public, anon;
grant execute on function public.marketing_autopost_add(text, text, jsonb, text) to authenticated;

-- Horários das refeições (Brasília = UTC-3): 7h, 11h30, 18h e 21h30.
select cron.schedule('marketing-autopost-story-cafe', '0 10 * * *', $$ select public.marketing_autopost_run('story', 'cafe'); $$);
select cron.schedule('marketing-autopost-story-almoco', '30 14 * * *', $$ select public.marketing_autopost_run('story', 'almoco'); $$);
select cron.schedule('marketing-autopost-story-jantar', '0 21 * * *', $$ select public.marketing_autopost_run('story', 'jantar'); $$);
select cron.schedule('marketing-autopost-story-ceia', '30 0 * * *', $$ select public.marketing_autopost_run('story', 'ceia'); $$);

-- Itens: stories de nutrição (4 por refeição) e os stories gerais em vídeo, com música.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media) values
  (23, 'nutri-cafe-1', 'story', 'cafe', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-cafe-1.mp4"}]'::jsonb),
  (24, 'nutri-almoco-1', 'story', 'almoco', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-almoco-1.mp4"}]'::jsonb),
  (25, 'nutri-jantar-1', 'story', 'jantar', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-jantar-1.mp4"}]'::jsonb),
  (26, 'nutri-ceia-1', 'story', 'ceia', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-ceia-1.mp4"}]'::jsonb),
  (27, 'nutri-cafe-2', 'story', 'cafe', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-cafe-2.mp4"}]'::jsonb),
  (28, 'nutri-almoco-2', 'story', 'almoco', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-almoco-2.mp4"}]'::jsonb),
  (29, 'nutri-jantar-2', 'story', 'jantar', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-jantar-2.mp4"}]'::jsonb),
  (30, 'nutri-ceia-2', 'story', 'ceia', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-ceia-2.mp4"}]'::jsonb),
  (31, 'nutri-cafe-3', 'story', 'cafe', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-cafe-3.mp4"}]'::jsonb),
  (32, 'nutri-almoco-3', 'story', 'almoco', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-almoco-3.mp4"}]'::jsonb),
  (33, 'nutri-jantar-3', 'story', 'jantar', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-jantar-3.mp4"}]'::jsonb),
  (34, 'nutri-ceia-3', 'story', 'ceia', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-ceia-3.mp4"}]'::jsonb),
  (35, 'nutri-cafe-4', 'story', 'cafe', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-cafe-4.mp4"}]'::jsonb),
  (36, 'nutri-almoco-4', 'story', 'almoco', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-almoco-4.mp4"}]'::jsonb),
  (37, 'nutri-jantar-4', 'story', 'jantar', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-jantar-4.mp4"}]'::jsonb),
  (38, 'nutri-ceia-4', 'story', 'ceia', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-ceia-4.mp4"}]'::jsonb);

update public.marketing_autopost_queue set media = '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-treino.mp4"}]'::jsonb where key = 'treino-story' and posted_at is null;
update public.marketing_autopost_queue set media = '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-evolucao.mp4"}]'::jsonb where key = 'evolucao-story' and posted_at is null;
update public.marketing_autopost_queue set media = '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-ao-vivo.mp4"}]'::jsonb where key = 'ao-vivo-story' and posted_at is null;
update public.marketing_autopost_queue set media = '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-historico.mp4"}]'::jsonb where key = 'historico-story' and posted_at is null;
update public.marketing_autopost_queue set media = '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-nutricao.mp4"}]'::jsonb where key = 'nutricao-story' and posted_at is null;
update public.marketing_autopost_queue set media = '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua.mp4"}]'::jsonb where key = 'agua-story' and posted_at is null;
