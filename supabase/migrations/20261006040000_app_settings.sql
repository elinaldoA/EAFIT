-- Configurações do app controladas pelo painel admin: modo manutenção, aviso
-- (banner) dentro do app e chaves de recursos (feature flags).
--
-- Uma linha por chave, valor em jsonb:
--   maintenance : { enabled, message }
--   banner      : { enabled, message, level: info|warning|success, linkUrl, linkLabel, version }
--   flags       : { <recurso>: true|false }   -- ausente = ligado
--
-- Leitura pública (anon + authenticated): o app precisa saber da manutenção
-- ANTES do login e nada aqui é sensível. Só admin escreve. O app trata falha
-- de leitura como "sem restrição" (fail-open), nunca bloqueia por causa disso.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists "public read" on public.app_settings;
create policy "public read" on public.app_settings
  for select to anon, authenticated using (true);

drop policy if exists "admin write" on public.app_settings;
create policy "admin write" on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.app_settings (key, value) values
  ('maintenance', '{"enabled": false, "message": ""}'),
  ('banner', '{"enabled": false, "message": "", "level": "info", "linkUrl": "", "linkLabel": "", "version": 0}'),
  ('flags', '{}')
on conflict (key) do nothing;
