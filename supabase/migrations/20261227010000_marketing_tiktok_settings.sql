-- Marketing → Publicar: escolhas do TikTok por post, como exigem as regras de
-- compartilhamento do TikTok para a auditoria do app (quem pode ver, sem valor
-- padrão; comentários, Dueto e Costura; divulgação de conteúdo comercial).
-- Formato: { privacy_level, allow_comment, allow_duet, allow_stitch,
-- brand_organic, brand_content }. Posts antigos ficam sem (null) e seguem o
-- comportamento anterior na Edge Function.

alter table public.marketing_posts
  add column if not exists tiktok jsonb;

drop function if exists public.marketing_create_post(text, jsonb, uuid[], timestamptz, text);

create or replace function public.marketing_create_post(
  p_caption text, p_media jsonb, p_accounts uuid[], p_scheduled_at timestamptz default null, p_format text default 'feed',
  p_tiktok jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_format text := coalesce(p_format, 'feed');
  v_tiktok boolean;
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

  v_tiktok := exists (select 1 from public.marketing_accounts where id = any(p_accounts) and platform = 'tiktok');
  if v_tiktok then
    if coalesce(p_tiktok ->> 'privacy_level', '') not in ('PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY') then
      raise exception 'tiktok_privacy_required';
    end if;
    if (p_tiktok ->> 'brand_content')::boolean is true and p_tiktok ->> 'privacy_level' = 'SELF_ONLY' then
      raise exception 'tiktok_branded_cannot_be_private';
    end if;
  end if;

  insert into public.marketing_posts (caption, media, scheduled_at, created_by, format, tiktok)
  values (
    case when v_format = 'story' then '' else coalesce(p_caption, '') end, coalesce(p_media, '[]'::jsonb), p_scheduled_at, auth.uid(), v_format,
    case when v_tiktok then jsonb_build_object(
      'privacy_level', p_tiktok ->> 'privacy_level',
      'allow_comment', coalesce((p_tiktok ->> 'allow_comment')::boolean, false),
      'allow_duet', coalesce((p_tiktok ->> 'allow_duet')::boolean, false),
      'allow_stitch', coalesce((p_tiktok ->> 'allow_stitch')::boolean, false),
      'brand_organic', coalesce((p_tiktok ->> 'brand_organic')::boolean, false),
      'brand_content', coalesce((p_tiktok ->> 'brand_content')::boolean, false)
    ) end
  )
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
revoke execute on function public.marketing_create_post(text, jsonb, uuid[], timestamptz, text, jsonb) from public, anon;
grant execute on function public.marketing_create_post(text, jsonb, uuid[], timestamptz, text, jsonb) to authenticated;
