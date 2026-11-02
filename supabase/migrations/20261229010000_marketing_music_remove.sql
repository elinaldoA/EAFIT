-- Desfaz a música nos stories (20261228010000, removida do repositório): a
-- biblioteca volta a aceitar só imagem e vídeo e sai a função que trocava a
-- mídia dos stories agendados. Nenhuma música chegou a ser usada.

drop function if exists public.marketing_set_story_media(uuid, jsonb);

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
where id = 'marketing-media';

delete from public.marketing_media where kind = 'audio';
alter table public.marketing_media drop constraint if exists marketing_media_kind_check;
alter table public.marketing_media
  add constraint marketing_media_kind_check check (kind in ('image', 'video'));
