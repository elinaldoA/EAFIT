-- EAFIT Run: mais dados por corrida e os tênis de corrida.
--
-- runs.elev_gain_m: subida acumulada (m) medida pela altitude do GPS, já
--   suavizada no aparelho (modules/corrida/elevation.js); null sem altitude.
-- runs.cadence: passos por minuto em média, contados pelo acelerômetro do
--   celular (modules/corrida/cadence.js); null quando não deu para medir.
-- runs.shoe_id: o tênis usado. Apagar o tênis deixa a corrida sem tênis.
--
-- run_shoes: tênis da pessoa. Os km de cada um são somados no app a partir
-- das corridas (mais initial_m, o que ele já tinha rodado antes do app);
-- limit_m é a vida útil para o aviso de troca. Privado do usuário.

create table if not exists public.run_shoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  initial_m integer not null default 0 check (initial_m between 0 and 5000000),
  limit_m integer not null default 700000 check (limit_m between 50000 and 5000000),
  retired boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists run_shoes_user_idx on public.run_shoes (user_id, created_at);

alter table public.run_shoes enable row level security;

drop policy if exists "own all" on public.run_shoes;
create policy "own all" on public.run_shoes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.run_shoes to authenticated;

alter table public.runs
  add column if not exists elev_gain_m integer check (elev_gain_m is null or elev_gain_m between 0 and 20000),
  add column if not exists cadence smallint check (cadence is null or cadence between 60 and 260),
  add column if not exists shoe_id uuid references public.run_shoes(id) on delete set null;

create index if not exists runs_shoe_idx on public.runs (shoe_id) where shoe_id is not null;

-- O tênis da corrida tem que ser da mesma pessoa (a FK sozinha aceitaria o
-- id de um tênis de outra conta).
create or replace function public.runs_check_shoe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shoe_id is not null and not exists (
    select 1 from public.run_shoes s where s.id = new.shoe_id and s.user_id = new.user_id
  ) then
    raise exception 'tênis inválido' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function public.runs_check_shoe() from public, anon, authenticated;

drop trigger if exists runs_check_shoe on public.runs;
create trigger runs_check_shoe
  before insert or update of shoe_id, user_id on public.runs
  for each row execute function public.runs_check_shoe();
