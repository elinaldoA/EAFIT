-- Atalhos de alimentos do próprio usuário (aba Nutrição): nome e macros de uma
-- porção, somados ao dia com um toque. Até 20 por usuário. A ordem por uso é
-- guardada no aparelho, não aqui.
create table if not exists public.nutrition_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  icon text not null default '🍽️' check (char_length(icon) <= 8),
  protein_g integer not null default 0 check (protein_g between 0 and 1000),
  kcal integer not null default 0 check (kcal between 0 and 5000),
  carbs_g integer not null default 0 check (carbs_g between 0 and 1000),
  fat_g integer not null default 0 check (fat_g between 0 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists nutrition_foods_user_idx on public.nutrition_foods (user_id);

create or replace function public.limit_nutrition_foods() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.nutrition_foods where user_id = new.user_id) >= 20 then
    raise exception 'limite de 20 atalhos de alimentos' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists nutrition_foods_limit on public.nutrition_foods;
create trigger nutrition_foods_limit before insert on public.nutrition_foods
  for each row execute function public.limit_nutrition_foods();

alter table public.nutrition_foods enable row level security;

drop policy if exists "own nutrition_foods" on public.nutrition_foods;
create policy "own nutrition_foods" on public.nutrition_foods
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "admin full access" on public.nutrition_foods;
create policy "admin full access" on public.nutrition_foods
  for all using (public.is_admin()) with check (public.is_admin());
