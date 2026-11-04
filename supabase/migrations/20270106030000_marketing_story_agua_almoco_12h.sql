-- Story do almoço às 12h e nova faixa de story de hidratação às 15h (Brasília = UTC-3).
--   07:00 café · 12:00 almoço · 13:00 geral · 15:00 hidratação · 18:00 feed · 19:30 jantar · 20:30 reel · 21:30 ceia

-- 1. A faixa `agua` passa a existir.
alter table public.marketing_autopost_queue drop constraint if exists marketing_autopost_queue_slot_check;
alter table public.marketing_autopost_queue add constraint marketing_autopost_queue_slot_check
  check (slot is null or slot in ('cafe', 'almoco', 'agua', 'jantar', 'ceia'));

-- 2. Adicionar item pelo painel aceita o horário `agua`.
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
  if p_slot is not null and (p_format <> 'story' or p_slot not in ('cafe', 'almoco', 'agua', 'jantar', 'ceia')) then raise exception 'invalid_slot'; end if;
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

-- 3. Horários.
select cron.schedule('marketing-autopost-story-almoco', '0 15 * * *', $$ select public.marketing_autopost_run('story', 'almoco'); $$);
select cron.schedule('marketing-autopost-story-agua', '0 18 * * *', $$ select public.marketing_autopost_run('story', 'agua'); $$);

-- 4. Stories de hidratação (4 vídeos com música).
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media) values
  (39, 'nutri-agua-1', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-1.mp4"}]'::jsonb),
  (40, 'nutri-agua-2', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-2.mp4"}]'::jsonb),
  (41, 'nutri-agua-3', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-3.mp4"}]'::jsonb),
  (42, 'nutri-agua-4', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-4.mp4"}]'::jsonb)
on conflict (key) do nothing;
