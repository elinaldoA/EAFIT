-- Marketing (painel → Marketing): contas das redes da EAFIT conectadas por
-- OAuth (Facebook, Instagram e Threads — TikTok fica para outra fase), fila
-- de publicação (agora ou agendada), biblioteca de mídia e caixa de
-- comentários com resposta. Quem fala com as redes são as Edge Functions
-- marketing-oauth (conectar) e marketing (publicar, sincronizar, responder,
-- cron); o painel só lê estas tabelas e chama RPCs.
--
-- Escrita: nova área 'marketing' (Sistema → Administradores; superadmin já
-- tem todas). Leitura: qualquer admin. Tokens: tabela sem nenhuma policy (só a
-- service role lê) e cifrados pela função com o secret MARKETING_TOKEN_KEY.
--
-- Passos manuais depois de aplicar (ver também o comentário no topo de
-- supabase/functions/marketing-oauth/index.ts):
--   1. Secrets das Edge Functions: META_APP_ID, META_APP_SECRET,
--      THREADS_APP_ID, THREADS_APP_SECRET e MARKETING_TOKEN_KEY
--      (openssl rand -base64 32).
--   2. Implantar marketing-oauth e marketing com Verify JWT desligado.

alter table public.admin_access drop constraint if exists admin_access_extra_areas_check;
alter table public.admin_access add constraint admin_access_extra_areas_check
  check (extra_areas <@ array['users', 'notifications', 'segments', 'content', 'settings', 'marketing']::text[]);

-- ---------- contas conectadas ----------

create table if not exists public.marketing_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'instagram', 'threads')),
  external_id text not null,
  name text not null default '',
  username text,
  picture_url text,
  -- Instagram aparece ligado à Página do Facebook (usa o token dela);
  -- desconectar a Página leva o Instagram junto.
  parent_id uuid references public.marketing_accounts(id) on delete cascade,
  status text not null default 'ok' check (status in ('ok', 'reconnect')),
  status_detail text,
  token_expires_at timestamptz, -- null = não expira (token de Página)
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (platform, external_id)
);

alter table public.marketing_accounts enable row level security;
drop policy if exists "admins read marketing_accounts" on public.marketing_accounts;
create policy "admins read marketing_accounts" on public.marketing_accounts for select using (public.is_admin());
revoke all on public.marketing_accounts from anon;

create table if not exists public.marketing_tokens (
  account_id uuid primary key references public.marketing_accounts(id) on delete cascade,
  token_enc text not null,
  updated_at timestamptz not null default now()
);
alter table public.marketing_tokens enable row level security;
revoke all on public.marketing_tokens from anon, authenticated;

create or replace function public.marketing_disconnect(p_account uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  delete from public.marketing_accounts where id = p_account;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingDisconnect', jsonb_build_object('account', p_account));
end;
$$;
revoke execute on function public.marketing_disconnect(uuid) from public, anon;
grant execute on function public.marketing_disconnect(uuid) to authenticated;

-- ---------- biblioteca de mídia ----------
-- Bucket público de propósito: Instagram, Threads e Facebook baixam a mídia
-- pela URL na hora de publicar. Só entra o que é para ser divulgado.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-media', 'marketing-media', true, 104857600, array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "marketing_media_admin_insert" on storage.objects;
create policy "marketing_media_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'marketing-media' and public.admin_can('marketing'));

drop policy if exists "marketing_media_admin_delete" on storage.objects;
create policy "marketing_media_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'marketing-media' and public.admin_can('marketing'));

create table if not exists public.marketing_media (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'video')),
  storage_path text not null unique,
  title text not null default '' check (char_length(title) <= 120),
  credit text check (char_length(credit) <= 200), -- vai no fim da legenda
  width int,
  height int,
  size_bytes bigint,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.marketing_media enable row level security;
drop policy if exists "admins read marketing_media" on public.marketing_media;
create policy "admins read marketing_media" on public.marketing_media for select using (public.is_admin());
drop policy if exists "marketing writes marketing_media" on public.marketing_media;
create policy "marketing writes marketing_media" on public.marketing_media for all
  using (public.admin_can('marketing')) with check (public.admin_can('marketing'));
revoke all on public.marketing_media from anon;

-- ---------- posts e fila de publicação ----------
-- Um post vai para várias contas; cada conta é um alvo com o próprio estado:
--   pending     esperando run_after (agendado ou recém-criado)
--   processing  container criado na rede (Instagram/Threads), esperando ficar pronto
--   published / failed / canceled

create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  caption text not null default '' check (char_length(caption) <= 5000),
  -- [{ "type": "image" | "video", "url": "https://...", "credit": "..." }]
  media jsonb not null default '[]'::jsonb
    check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 10),
  scheduled_at timestamptz, -- null = publicar na hora
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.marketing_posts(id) on delete cascade,
  account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'published', 'failed', 'canceled')),
  container_id text,
  external_id text,
  permalink text,
  error text,
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (post_id, account_id)
);
create index if not exists marketing_post_targets_due_idx
  on public.marketing_post_targets (run_after) where status in ('pending', 'processing');

alter table public.marketing_posts enable row level security;
alter table public.marketing_post_targets enable row level security;
drop policy if exists "admins read marketing_posts" on public.marketing_posts;
create policy "admins read marketing_posts" on public.marketing_posts for select using (public.is_admin());
drop policy if exists "admins read marketing_post_targets" on public.marketing_post_targets;
create policy "admins read marketing_post_targets" on public.marketing_post_targets for select using (public.is_admin());
revoke all on public.marketing_posts, public.marketing_post_targets from anon;

create or replace function public.marketing_create_post(
  p_caption text, p_media jsonb, p_accounts uuid[], p_scheduled_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  if coalesce(cardinality(p_accounts), 0) = 0 then raise exception 'no_accounts'; end if;
  if coalesce(btrim(p_caption), '') = '' and coalesce(jsonb_array_length(p_media), 0) = 0 then raise exception 'empty_post'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) m
    where m ->> 'type' not in ('image', 'video') or coalesce(m ->> 'url', '') !~ '^https://'
  ) then raise exception 'invalid_media'; end if;
  if (select count(*) from public.marketing_accounts where id = any(p_accounts)) <> cardinality(p_accounts) then
    raise exception 'unknown_account';
  end if;

  insert into public.marketing_posts (caption, media, scheduled_at, created_by)
  values (coalesce(p_caption, ''), coalesce(p_media, '[]'::jsonb), p_scheduled_at, auth.uid())
  returning id into v_id;

  insert into public.marketing_post_targets (post_id, account_id, run_after)
  select v_id, a, coalesce(greatest(p_scheduled_at, now()), now()) from unnest(p_accounts) a;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingPost', jsonb_build_object(
    'post', v_id, 'accounts', cardinality(p_accounts), 'scheduled_at', p_scheduled_at, 'caption', left(p_caption, 200)
  ));
  return v_id;
end;
$$;
revoke execute on function public.marketing_create_post(text, jsonb, uuid[], timestamptz) from public, anon;
grant execute on function public.marketing_create_post(text, jsonb, uuid[], timestamptz) to authenticated;

-- Cancela o que ainda não saiu (agendado). O que já está em processamento na
-- rede segue: o container já existe lá.
create or replace function public.marketing_cancel_post(p_post uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  update public.marketing_post_targets set status = 'canceled', updated_at = now()
  where post_id = p_post and status = 'pending';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.marketing_cancel_post(uuid) from public, anon;
grant execute on function public.marketing_cancel_post(uuid) to authenticated;

create or replace function public.marketing_retry_target(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  update public.marketing_post_targets
  set status = 'pending', error = null, container_id = null, attempts = 0, run_after = now(), locked_until = null, updated_at = now()
  where id = p_target and status = 'failed';
end;
$$;
revoke execute on function public.marketing_retry_target(uuid) from public, anon;
grant execute on function public.marketing_retry_target(uuid) to authenticated;

-- Reserva os alvos vencidos para uma execução da função (o cron roda a cada
-- minuto e um envio pode demorar mais que isso: sem a trava, o mesmo post
-- sairia duas vezes). Só a service role chama.
create or replace function public.marketing_claim_targets(p_post uuid default null, p_limit int default 20)
returns setof public.marketing_post_targets
language sql
security definer
set search_path = public
as $$
  update public.marketing_post_targets t
  set locked_until = now() + interval '5 minutes', attempts = t.attempts + 1, updated_at = now()
  where t.id in (
    select id from public.marketing_post_targets
    where status in ('pending', 'processing') and run_after <= now()
      and (locked_until is null or locked_until < now())
      and (p_post is null or post_id = p_post)
    order by run_after
    limit p_limit
    for update skip locked
  )
  returning t.*;
$$;
revoke execute on function public.marketing_claim_targets(uuid, int) from public, anon, authenticated;

-- ---------- comentários ----------

create table if not exists public.marketing_comments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  external_id text not null,
  post_external_id text,
  post_permalink text,
  post_caption text,
  author text,
  text text not null default '',
  commented_at timestamptz,
  hidden boolean not null default false,
  answered boolean not null default false, -- já tem resposta nossa (pelo painel ou direto na rede)
  reply_text text,
  replied_at timestamptz,
  replied_by uuid references auth.users(id) on delete set null,
  fetched_at timestamptz not null default now(),
  unique (account_id, external_id)
);
create index if not exists marketing_comments_recent_idx on public.marketing_comments (commented_at desc);

alter table public.marketing_comments enable row level security;
drop policy if exists "admins read marketing_comments" on public.marketing_comments;
create policy "admins read marketing_comments" on public.marketing_comments for select using (public.is_admin());
revoke all on public.marketing_comments from anon;

-- A sincronização regrava texto e estado, sem perder a resposta dada pelo
-- painel (a rede pode demorar a mostrá-la). Só a service role chama.
create or replace function public.marketing_upsert_comments(p_account uuid, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into public.marketing_comments as c (
    account_id, external_id, post_external_id, post_permalink, post_caption, author, text, commented_at, hidden, answered, fetched_at
  )
  select p_account, r ->> 'external_id', r ->> 'post_external_id', r ->> 'post_permalink', left(r ->> 'post_caption', 300),
    left(r ->> 'author', 120), left(coalesce(r ->> 'text', ''), 5000), (r ->> 'commented_at')::timestamptz,
    coalesce((r ->> 'hidden')::boolean, false), coalesce((r ->> 'answered')::boolean, false), now()
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r ->> 'external_id', '') <> ''
  on conflict (account_id, external_id) do update set
    post_permalink = excluded.post_permalink,
    post_caption = excluded.post_caption,
    text = excluded.text,
    hidden = excluded.hidden,
    answered = excluded.answered or c.replied_at is not null,
    fetched_at = now();
  get diagnostics n = row_count;
  update public.marketing_accounts set last_synced_at = now() where id = p_account;
  return n;
end;
$$;
revoke execute on function public.marketing_upsert_comments(uuid, jsonb) from public, anon, authenticated;

-- ---------- crons ----------
-- A função só é chamada quando há trabalho (o "where exists" roda no banco),
-- para não gastar uma invocação por minuto à toa.

select cron.schedule(
  'marketing-publish-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/marketing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"job": "publish"}'::jsonb
  )
  where exists (
    select 1 from public.marketing_post_targets
    where status in ('pending', 'processing') and run_after <= now()
  );
  $$
);

select cron.schedule(
  'marketing-sync-comments',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/marketing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"job": "sync"}'::jsonb
  )
  where exists (select 1 from public.marketing_accounts where status = 'ok');
  $$
);

-- Token do Threads vale 60 dias e é renovado quando faltam menos de 15.
select cron.schedule(
  'marketing-refresh-tokens',
  '30 7 * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/marketing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"job": "refresh"}'::jsonb
  )
  where exists (
    select 1 from public.marketing_accounts
    where status = 'ok' and token_expires_at is not null and token_expires_at < now() + interval '15 days'
  );
  $$
);
