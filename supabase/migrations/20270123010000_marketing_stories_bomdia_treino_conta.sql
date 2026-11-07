-- Stories de uso diário: bom dia, hora do treino e criar conta, cada um na sua faixa.
--
-- Objetivo: o usuário abrir o app todo dia (bom dia de manhã, treino no fim da tarde) e
-- atrair gente nova (um story de criar conta por dia entre os demais).
--
--   seg a sex                       sáb e dom
--   06:30 story café                09:00 story café
--   07:30 story bom dia (novo)      08:00 story bom dia
--   10:00 story criar conta (novo)  10:00 story criar conta
--   11:30 feed                      10:30 feed
--   12:30 story geral               12:30 story geral
--   15:00 story hidratação          15:00 story hidratação
--   16:30 story hora do treino (novo)
--   17:30 story geral               17:30 story geral
--   19:30 story geral               19:30 story geral
--   20:45 reel                      18:30 reel
--
-- Conteúdo: 14 bom dia, 14 hora do treino e 6 criar conta (vídeos de 8 s com música, de
-- app-admin/scripts/marketing-stories.mjs, ONLY=engaja) mais o tutorial narrado de criar
-- conta, que sai da fila geral e vai para a faixa de criar conta. Os tutoriais narrados
-- (story-v3-*) levam música baixa por baixo da voz (marketing-stories-narrados.mjs).
-- Painel: AUTOPOST_LANES e SLOT_LABEL em app-admin/src/lib/marketing.js.

-- 1. Novos horários de story.
alter table public.marketing_autopost_queue drop constraint if exists marketing_autopost_queue_slot_check;
alter table public.marketing_autopost_queue add constraint marketing_autopost_queue_slot_check
  check (slot is null or slot in ('cafe', 'almoco', 'agua', 'jantar', 'ceia', 'bomdia', 'treino', 'conta'));

-- 2. Adicionar item pelo painel aceita os novos horários.
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
  if p_slot is not null and (p_format <> 'story' or p_slot not in ('cafe', 'agua', 'bomdia', 'treino', 'conta')) then raise exception 'invalid_slot'; end if;
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

-- 3. Cron (UTC; Brasília = UTC-3). Bom dia muda no fim de semana: um job para cada.
select cron.schedule('marketing-autopost-story-bomdia', '30 10 * * 1-5', $$ select public.marketing_autopost_run('story', 'bomdia'); $$);
select cron.schedule('marketing-autopost-story-bomdia-fds', '0 11 * * 0,6', $$ select public.marketing_autopost_run('story', 'bomdia'); $$);
select cron.schedule('marketing-autopost-story-conta', '0 13 * * *', $$ select public.marketing_autopost_run('story', 'conta'); $$);
select cron.schedule('marketing-autopost-story-treino', '30 19 * * *', $$ select public.marketing_autopost_run('story', 'treino'); $$);

-- 4. O tutorial de criar conta sai da fila geral e vai para a faixa de criar conta.
update public.marketing_autopost_queue set slot = 'conta'
where key = 'v3-criar-conta-story' and posted_at is null and skipped_at is null;

-- 5. Itens novos.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, 'story', v.slot, '',
  jsonb_build_array(jsonb_build_object('type', 'video', 'url', 'https://eafit.com.br/img/marketing/' || v.file))
from (values
  (1, 'bomdia-1-story', 'bomdia', 'story-bomdia-1.mp4'),
  (2, 'bomdia-2-story', 'bomdia', 'story-bomdia-2.mp4'),
  (3, 'bomdia-3-story', 'bomdia', 'story-bomdia-3.mp4'),
  (4, 'bomdia-4-story', 'bomdia', 'story-bomdia-4.mp4'),
  (5, 'bomdia-5-story', 'bomdia', 'story-bomdia-5.mp4'),
  (6, 'bomdia-6-story', 'bomdia', 'story-bomdia-6.mp4'),
  (7, 'bomdia-7-story', 'bomdia', 'story-bomdia-7.mp4'),
  (8, 'bomdia-8-story', 'bomdia', 'story-bomdia-8.mp4'),
  (9, 'bomdia-9-story', 'bomdia', 'story-bomdia-9.mp4'),
  (10, 'bomdia-10-story', 'bomdia', 'story-bomdia-10.mp4'),
  (11, 'bomdia-11-story', 'bomdia', 'story-bomdia-11.mp4'),
  (12, 'bomdia-12-story', 'bomdia', 'story-bomdia-12.mp4'),
  (13, 'bomdia-13-story', 'bomdia', 'story-bomdia-13.mp4'),
  (14, 'bomdia-14-story', 'bomdia', 'story-bomdia-14.mp4'),
  (15, 'treino-1-story', 'treino', 'story-treino-1.mp4'),
  (16, 'treino-2-story', 'treino', 'story-treino-2.mp4'),
  (17, 'treino-3-story', 'treino', 'story-treino-3.mp4'),
  (18, 'treino-4-story', 'treino', 'story-treino-4.mp4'),
  (19, 'treino-5-story', 'treino', 'story-treino-5.mp4'),
  (20, 'treino-6-story', 'treino', 'story-treino-6.mp4'),
  (21, 'treino-7-story', 'treino', 'story-treino-7.mp4'),
  (22, 'treino-8-story', 'treino', 'story-treino-8.mp4'),
  (23, 'treino-9-story', 'treino', 'story-treino-9.mp4'),
  (24, 'treino-10-story', 'treino', 'story-treino-10.mp4'),
  (25, 'treino-11-story', 'treino', 'story-treino-11.mp4'),
  (26, 'treino-12-story', 'treino', 'story-treino-12.mp4'),
  (27, 'treino-13-story', 'treino', 'story-treino-13.mp4'),
  (28, 'treino-14-story', 'treino', 'story-treino-14.mp4'),
  (29, 'conta-1-story', 'conta', 'story-conta-1.mp4'),
  (30, 'conta-2-story', 'conta', 'story-conta-2.mp4'),
  (31, 'conta-3-story', 'conta', 'story-conta-3.mp4'),
  (32, 'conta-4-story', 'conta', 'story-conta-4.mp4'),
  (33, 'conta-5-story', 'conta', 'story-conta-5.mp4'),
  (34, 'conta-6-story', 'conta', 'story-conta-6.mp4')
) as v(n, key, slot, file)
on conflict (key) do nothing;
