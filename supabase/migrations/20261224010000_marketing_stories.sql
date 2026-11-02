-- Marketing → Publicar: stories. Um post agora tem formato: 'feed' (como
-- antes) ou 'story' (Instagram e Página do Facebook; o Threads não tem). Story
-- leva exatamente uma imagem ou um vídeo e não tem legenda.

alter table public.marketing_posts
  add column if not exists format text not null default 'feed' check (format in ('feed', 'story'));

drop function if exists public.marketing_create_post(text, jsonb, uuid[], timestamptz);

create or replace function public.marketing_create_post(
  p_caption text, p_media jsonb, p_accounts uuid[], p_scheduled_at timestamptz default null, p_format text default 'feed'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_format text := coalesce(p_format, 'feed');
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  if coalesce(cardinality(p_accounts), 0) = 0 then raise exception 'no_accounts'; end if;
  if v_format not in ('feed', 'story') then raise exception 'invalid_format'; end if;
  if coalesce(btrim(p_caption), '') = '' and coalesce(jsonb_array_length(p_media), 0) = 0 then raise exception 'empty_post'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) m
    where m ->> 'type' not in ('image', 'video') or coalesce(m ->> 'url', '') !~ '^https://'
  ) then raise exception 'invalid_media'; end if;
  if (select count(*) from public.marketing_accounts where id = any(p_accounts)) <> cardinality(p_accounts) then
    raise exception 'unknown_account';
  end if;
  if v_format = 'story' then
    if coalesce(jsonb_array_length(p_media), 0) <> 1 then raise exception 'story_needs_one_media'; end if;
    if exists (select 1 from public.marketing_accounts where id = any(p_accounts) and platform = 'threads') then
      raise exception 'story_not_on_threads';
    end if;
  end if;

  insert into public.marketing_posts (caption, media, scheduled_at, created_by, format)
  values (case when v_format = 'story' then '' else coalesce(p_caption, '') end, coalesce(p_media, '[]'::jsonb), p_scheduled_at, auth.uid(), v_format)
  returning id into v_id;

  insert into public.marketing_post_targets (post_id, account_id, run_after)
  select v_id, a, coalesce(greatest(p_scheduled_at, now()), now()) from unnest(p_accounts) a;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingPost', jsonb_build_object(
    'post', v_id, 'accounts', cardinality(p_accounts), 'scheduled_at', p_scheduled_at, 'format', v_format,
    'caption', left(p_caption, 200)
  ));
  return v_id;
end;
$$;
revoke execute on function public.marketing_create_post(text, jsonb, uuid[], timestamptz, text) from public, anon;
grant execute on function public.marketing_create_post(text, jsonb, uuid[], timestamptz, text) to authenticated;
