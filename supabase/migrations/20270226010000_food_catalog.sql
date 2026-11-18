-- Catálogo de alimentos mantido pelo painel admin (Conteúdo > Catálogo de
-- alimentos) e lido pela busca da aba Nutrição, ao lado da Tabela TACO e da
-- lista que vai dentro do app. Valores por 100 g; `portion_g` é a quantidade
-- que a busca sugere. Um item com o mesmo nome de um alimento da lista do app
-- o substitui (correção de valores sem novo deploy). `estimated` marca pratos
-- e itens de valor aproximado: a tela mostra o selo "estimado".
-- `measures`: medidas caseiras, [{ "label": "fatia", "grams": 30 }].
create table if not exists public.food_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  icon text not null default '🍽️' check (char_length(icon) <= 8),
  category text check (category is null or char_length(category) <= 40),
  portion_g integer not null default 100 check (portion_g between 1 and 2000),
  kcal numeric(6, 1) not null check (kcal between 0 and 900),
  protein_g numeric(5, 1) not null default 0 check (protein_g between 0 and 100),
  carbs_g numeric(5, 1) not null default 0 check (carbs_g between 0 and 100),
  fat_g numeric(5, 1) not null default 0 check (fat_g between 0 and 100),
  fiber_g numeric(5, 1) not null default 0 check (fiber_g between 0 and 100),
  sodium_mg numeric(7, 1) not null default 0 check (sodium_mg between 0 and 40000),
  estimated boolean not null default false,
  active boolean not null default true,
  measures jsonb not null default '[]'::jsonb check (jsonb_typeof(measures) = 'array' and jsonb_array_length(measures) <= 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists food_catalog_name_key on public.food_catalog (lower(btrim(name)));

alter table public.food_catalog enable row level security;

-- Qualquer pessoa lê os itens ativos; quem edita o conteúdo vê também os inativos.
drop policy if exists "food_catalog_select" on public.food_catalog;
create policy "food_catalog_select" on public.food_catalog
  for select using (active or admin_can('content'::text));

drop policy if exists "food_catalog_insert" on public.food_catalog;
create policy "food_catalog_insert" on public.food_catalog
  for insert with check (admin_can('content'::text));

drop policy if exists "food_catalog_update" on public.food_catalog;
create policy "food_catalog_update" on public.food_catalog
  for update using (admin_can('content'::text)) with check (admin_can('content'::text));

drop policy if exists "food_catalog_delete" on public.food_catalog;
create policy "food_catalog_delete" on public.food_catalog
  for delete using (admin_can('content'::text));
