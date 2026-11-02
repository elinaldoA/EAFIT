-- Marketing alimenta o material de embaixadores e influenciadores: da
-- Biblioteca de mídia, um item vira material de divulgação (cópia no bucket
-- privado promo-materials) com um texto pronto opcional, que o app mostra com
-- o botão "Copiar texto" já com o link do parceiro.
--
-- Subir e remover material passa a valer também para a área 'marketing'
-- (antes só 'content').

alter table public.promo_materials
  add column if not exists caption text not null default '' check (length(caption) <= 1000),
  -- de qual item da Biblioteca de mídia veio (o painel marca "já enviado")
  add column if not exists source_media_id uuid references public.marketing_media(id) on delete set null;

create index if not exists promo_materials_source_media_idx on public.promo_materials (source_media_id)
  where source_media_id is not null;

drop policy if exists "content admin inserts promo materials" on public.promo_materials;
create policy "content admin inserts promo materials" on public.promo_materials
  for insert with check ((public.admin_can('content') or public.admin_can('marketing')) and created_by = auth.uid());

drop policy if exists "content admin deletes promo materials" on public.promo_materials;
create policy "content admin deletes promo materials" on public.promo_materials
  for delete using (public.admin_can('content') or public.admin_can('marketing'));

drop policy if exists "promo_materials_admin_insert" on storage.objects;
create policy "promo_materials_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'promo-materials' and (public.admin_can('content') or public.admin_can('marketing')));

drop policy if exists "promo_materials_admin_delete" on storage.objects;
create policy "promo_materials_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'promo-materials' and (public.admin_can('content') or public.admin_can('marketing')));
