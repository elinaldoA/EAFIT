-- Medidas corporais (cintura, quadril, peito, braço, coxa) e check-in diário
-- (energia, sono e humor de 1 a 5). Os dois são privados do usuário: ele lê,
-- grava e apaga só o que é dele. Um registro por dia (upsert pela data).

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  cintura numeric check (cintura is null or cintura between 20 and 300),
  quadril numeric check (quadril is null or quadril between 20 and 300),
  peito numeric check (peito is null or peito between 20 and 300),
  braco numeric check (braco is null or braco between 10 and 100),
  coxa numeric check (coxa is null or coxa between 20 and 150),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  energy smallint not null check (energy between 1 and 5),
  sleep smallint not null check (sleep between 1 and 5),
  mood smallint not null check (mood between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

alter table public.body_measurements enable row level security;
alter table public.daily_checkins enable row level security;

drop policy if exists "own all" on public.body_measurements;
create policy "own all" on public.body_measurements
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own all" on public.daily_checkins;
create policy "own all" on public.daily_checkins
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
