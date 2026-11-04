-- Marketing → Publicar → Fila: editor da fila da publicação automática.
-- O admin com a área 'marketing' edita a legenda, reordena, remove, repõe o que
-- foi pulado por repetição e adiciona itens, tudo só do que ainda não saiu.
-- (A fila e o cron estão em 20261230010000_marketing_autopost.sql.)

-- Edita a legenda de um item que ainda não saiu. Story não tem legenda.
create or replace function public.marketing_autopost_update(p_id uuid, p_caption text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.marketing_autopost_queue;
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  select * into v_item from public.marketing_autopost_queue where id = p_id and posted_at is null for update;
  if not found then raise exception 'not_found'; end if;
  if v_item.format = 'story' then raise exception 'story_has_no_caption'; end if;
  if char_length(coalesce(p_caption, '')) > 5000 then raise exception 'caption_too_long'; end if;
  update public.marketing_autopost_queue set caption = coalesce(p_caption, ''), skipped_at = null where id = p_id;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingAutopostEdit', jsonb_build_object('key', v_item.key, 'action', 'caption'));
end;
$$;
revoke execute on function public.marketing_autopost_update(uuid, text) from public, anon;
grant execute on function public.marketing_autopost_update(uuid, text) to authenticated;

-- Sobe ou desce um item entre os pendentes do mesmo formato.
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
  where format = v_item.format and posted_at is null and skipped_at is null
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

-- Remove da fila um item que ainda não saiu.
create or replace function public.marketing_autopost_remove(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.marketing_autopost_queue;
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  select * into v_item from public.marketing_autopost_queue where id = p_id and posted_at is null for update;
  if not found then raise exception 'not_found'; end if;
  delete from public.marketing_autopost_queue where id = p_id;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingAutopostEdit', jsonb_build_object('key', v_item.key, 'action', 'remove'));
end;
$$;
revoke execute on function public.marketing_autopost_remove(uuid) from public, anon;
grant execute on function public.marketing_autopost_remove(uuid) to authenticated;

-- Repõe um item pulado por repetição (vai para o fim dos pendentes do formato).
-- Se a legenda ou a mídia continuar igual a um post já feito, o cron pula de novo.
create or replace function public.marketing_autopost_restore(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.marketing_autopost_queue;
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  select * into v_item from public.marketing_autopost_queue where id = p_id and posted_at is null and skipped_at is not null for update;
  if not found then raise exception 'not_found'; end if;
  update public.marketing_autopost_queue
  set skipped_at = null,
      position = (select coalesce(max(position), 0) + 1 from public.marketing_autopost_queue)
  where id = p_id;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingAutopostEdit', jsonb_build_object('key', v_item.key, 'action', 'restore'));
end;
$$;
revoke execute on function public.marketing_autopost_restore(uuid) from public, anon;
grant execute on function public.marketing_autopost_restore(uuid) to authenticated;

-- Adiciona um item ao fim da fila. Mesmas regras do painel de publicar:
-- story = 1 mídia e sem legenda; reel = 1 vídeo; feed = até 10 imagens ou 1 vídeo.
create or replace function public.marketing_autopost_add(p_format text, p_caption text, p_media jsonb)
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

  insert into public.marketing_autopost_queue (position, key, format, caption, media)
  values (
    (select coalesce(max(position), 0) + 1 from public.marketing_autopost_queue),
    'manual-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
    p_format,
    case when p_format = 'story' then '' else p_caption end,
    p_media
  )
  returning id into v_id;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingAutopostEdit', jsonb_build_object('action', 'add', 'format', p_format, 'id', v_id));
  return v_id;
end;
$$;
revoke execute on function public.marketing_autopost_add(text, text, jsonb) from public, anon;
grant execute on function public.marketing_autopost_add(text, text, jsonb) to authenticated;
