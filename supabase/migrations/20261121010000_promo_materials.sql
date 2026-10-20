-- Material de divulgação para influenciadores: logos, prints, vídeos e PDFs que
-- a equipe sobe no painel admin (Pessoas → Embaixadores e influenciadores) e o
-- influenciador baixa no app (modo Influenciador → Divulgar).
--
-- Bucket PRIVADO: dá para preparar o material de uma campanha antes de ela
-- sair. Só influenciador ativo e admin leem; o app baixa por URL assinada.
-- Escrever (subir e remover) é da área 'content' do painel (admin_can).

-- ---------------------------------------------------------------------------
-- Quem é influenciador ativo (usado nas policies)
-- ---------------------------------------------------------------------------
create or replace function public.is_active_influencer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ambassadors a
    where a.user_id = auth.uid() and a.kind = 'influenciador' and a.active
  );
$$;

revoke execute on function public.is_active_influencer() from public, anon;
grant execute on function public.is_active_influencer() to authenticated;

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------
create table if not exists public.promo_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 80),
  description text not null default '' check (length(description) <= 300),
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 120),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists promo_materials_created_idx on public.promo_materials (created_at desc);
create index if not exists promo_materials_created_by_idx on public.promo_materials (created_by);

alter table public.promo_materials enable row level security;

drop policy if exists "influencer or admin reads promo materials" on public.promo_materials;
create policy "influencer or admin reads promo materials" on public.promo_materials
  for select using (public.is_active_influencer() or public.is_admin());

drop policy if exists "content admin inserts promo materials" on public.promo_materials;
create policy "content admin inserts promo materials" on public.promo_materials
  for insert with check (public.admin_can('content') and created_by = auth.uid());

drop policy if exists "content admin deletes promo materials" on public.promo_materials;
create policy "content admin deletes promo materials" on public.promo_materials
  for delete using (public.admin_can('content'));

revoke all on public.promo_materials from anon, authenticated;
grant select, insert, delete on public.promo_materials to authenticated;

-- ---------------------------------------------------------------------------
-- Bucket (50 MB por arquivo; imagens, vídeos, PDF e zip)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'promo-materials', 'promo-materials', false, 52428800,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf', 'application/zip'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "promo_materials_read" on storage.objects;
create policy "promo_materials_read"
  on storage.objects for select
  using (bucket_id = 'promo-materials' and (public.is_active_influencer() or public.is_admin()));

drop policy if exists "promo_materials_admin_insert" on storage.objects;
create policy "promo_materials_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'promo-materials' and public.admin_can('content'));

drop policy if exists "promo_materials_admin_delete" on storage.objects;
create policy "promo_materials_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'promo-materials' and public.admin_can('content'));
