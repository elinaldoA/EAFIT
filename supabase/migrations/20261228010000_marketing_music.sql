-- Marketing → música nos stories. A API da Meta não põe o adesivo de música do
-- Instagram; a música vai dentro do vídeo do story, que o painel monta no
-- navegador (imagem ou vídeo + trecho da música → MP4). As músicas ficam na
-- biblioteca de mídia como kind 'audio' (MP3 ou M4A, sem direitos autorais).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-media', 'marketing-media', true, 104857600,
  array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/mp4'])
on conflict (id) do update set allowed_mime_types = excluded.allowed_mime_types;

alter table public.marketing_media drop constraint if exists marketing_media_kind_check;
alter table public.marketing_media
  add constraint marketing_media_kind_check check (kind in ('image', 'video', 'audio'));

-- Música automática: o painel monta o vídeo (arte do story + música) e troca a
-- mídia do story agendado por ele. Só story que ainda não saiu em nenhuma rede
-- nem está com o worker (locked_until); a mídia nova é um vídeo só.
create or replace function public.marketing_set_story_media(p_post uuid, p_media jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  if coalesce(jsonb_array_length(p_media), 0) <> 1 or p_media -> 0 ->> 'type' <> 'video'
    or coalesce(p_media -> 0 ->> 'url', '') !~ '^https://' then
    raise exception 'invalid_media';
  end if;
  if not exists (select 1 from public.marketing_posts where id = p_post and format = 'story') then raise exception 'not_a_story'; end if;
  -- Trava os alvos: o worker não pega o story no meio da troca.
  perform 1 from public.marketing_post_targets where post_id = p_post for update;
  if exists (
    select 1 from public.marketing_post_targets
    where post_id = p_post and (status not in ('pending', 'canceled') or locked_until > now())
  ) or not exists (select 1 from public.marketing_post_targets where post_id = p_post and status = 'pending') then
    raise exception 'story_not_pending';
  end if;

  update public.marketing_posts set media = p_media where id = p_post;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingStoryMusic', jsonb_build_object('post', p_post, 'music', p_media -> 0 ->> 'music'));
end;
$$;
revoke execute on function public.marketing_set_story_media(uuid, jsonb) from public, anon;
grant execute on function public.marketing_set_story_media(uuid, jsonb) to authenticated;
