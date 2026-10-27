-- Diário por refeição (aba Nutrição): cada alimento registrado vira uma linha
-- com refeição, nome e macros. Os totais do dia continuam em protein_logs (é
-- deles que saem metas, e-mails e relatórios); esta tabela é o detalhe, e o
-- app mantém os dois em sincronia. O id nasce no aparelho (fila offline).
create table if not exists public.nutrition_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  meal text not null default 'outro' check (meal in ('cafe', 'almoco', 'lanche', 'jantar', 'outro')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  icon text not null default '🍽️' check (char_length(icon) <= 8),
  protein_g integer not null default 0 check (protein_g between 0 and 1000),
  kcal integer not null default 0 check (kcal between 0 and 5000),
  carbs_g integer not null default 0 check (carbs_g between 0 and 1000),
  fat_g integer not null default 0 check (fat_g between 0 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists nutrition_entries_user_date_idx on public.nutrition_entries (user_id, log_date);

-- Teto por dia, para um laço no app não encher a tabela.
create or replace function public.limit_nutrition_entries() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.nutrition_entries where id = new.id) then
    return new;
  end if;
  if (select count(*) from public.nutrition_entries where user_id = new.user_id and log_date = new.log_date) >= 100 then
    raise exception 'limite de 100 registros por dia' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists nutrition_entries_limit on public.nutrition_entries;
create trigger nutrition_entries_limit before insert on public.nutrition_entries
  for each row execute function public.limit_nutrition_entries();

alter table public.nutrition_entries enable row level security;

drop policy if exists "own nutrition_entries" on public.nutrition_entries;
create policy "own nutrition_entries" on public.nutrition_entries
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "admin full access" on public.nutrition_entries;
create policy "admin full access" on public.nutrition_entries
  for all using (public.is_admin()) with check (public.is_admin());
