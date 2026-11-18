-- Açúcares e gordura saturada por registro do diário e por item do catálogo
-- de alimentos. Opcionais: sem número (null) o alimento não traz o dado
-- (atalho, valor digitado, item da TACO) e a tela só soma quem traz.
alter table public.nutrition_entries
  add column if not exists sugar_g numeric(5, 1) check (sugar_g between 0 and 1000),
  add column if not exists sat_fat_g numeric(5, 1) check (sat_fat_g between 0 and 1000);

alter table public.food_catalog
  add column if not exists sugar_g numeric(5, 1) check (sugar_g between 0 and 100),
  add column if not exists sat_fat_g numeric(5, 1) check (sat_fat_g between 0 and 100);
