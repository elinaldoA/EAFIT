-- Mídia própria de demonstração de execução (GIF, imagem ou vídeo curto),
-- enviada pelo painel admin. Quando existe, substitui no app a demonstração
-- padrão do Free Exercise DB (app-react/src/data/exerciseMedia.js).
--
-- Chave = nome exato do exercício (sem o emoji de prefixo dos exercícios de
-- pós-treino), igual ao agrupamento de histórico/recordes — não é FK pra
-- exercise_library porque templates e planos usam variações de nome que não
-- estão na biblioteca (ex.: "Afundo Búlgaro (foco glúteo)").
create table if not exists public.exercise_media (
  nome text primary key,
  storage_path text not null,
  media_type text not null check (media_type in ('imagem', 'video')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.exercise_media enable row level security;

drop policy if exists "anyone can read exercise_media" on public.exercise_media;
create policy "anyone can read exercise_media" on public.exercise_media
  for select using (true);

drop policy if exists "admin full access" on public.exercise_media;
create policy "admin full access" on public.exercise_media
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists exercise_media_updated_by_idx on public.exercise_media (updated_by);

-- Bucket público: as URLs são estáveis e o service worker do app consegue
-- guardar as imagens em cache (bucket privado exigiria URL assinada, que muda).
-- Limite de 15MB por arquivo e só formatos que o navegador toca direto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-media', 'exercise-media', true, 15728640,
  array['image/gif', 'image/webp', 'image/png', 'image/jpeg', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exercise_media_admin_insert" on storage.objects;
create policy "exercise_media_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'exercise-media' and public.is_admin());

drop policy if exists "exercise_media_admin_update" on storage.objects;
create policy "exercise_media_admin_update"
  on storage.objects for update
  using (bucket_id = 'exercise-media' and public.is_admin());

drop policy if exists "exercise_media_admin_delete" on storage.objects;
create policy "exercise_media_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'exercise-media' and public.is_admin());

-- Correção: admin_audit_log só tinha policy de leitura, então os inserts
-- feitos direto pelo painel (UserDetail: promover/remover admin; e agora a
-- mídia de exercícios) eram bloqueados pelo RLS em silêncio. O admin só pode
-- gravar ações em nome dele mesmo.
drop policy if exists "admin writes own audit entries" on public.admin_audit_log;
create policy "admin writes own audit entries" on public.admin_audit_log
  for insert with check (public.is_admin() and admin_id = auth.uid());
