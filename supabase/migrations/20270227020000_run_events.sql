-- Calendário de provas de corrida: "Próximas corridas perto de você" na aba
-- Gravar do EAFIT Run.
--
-- As provas entram como rascunho (importadas de um calendário ou cadastradas
-- à mão) e só aparecem no app depois que o admin aprova (Conteúdo > Provas de
-- corrida). `source` + `source_id` evitam duplicar a mesma prova numa nova
-- importação. `url` é sempre a página do organizador (inscrição/informações).
-- Distâncias em km: {5,10}. lat/lng podem faltar; sem eles a prova só entra
-- na lista por estado (UF).
create table if not exists public.run_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 120),
  event_date date not null,
  city text check (city is null or char_length(city) <= 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  venue text check (venue is null or char_length(venue) <= 120),
  lat numeric(8, 5) check (lat is null or lat between -90 and 90),
  lng numeric(8, 5) check (lng is null or lng between -180 and 180),
  distances numeric(6, 2)[] not null default '{}' check (cardinality(distances) <= 8),
  url text check (url is null or url ~* '^https?://'),
  source text not null default 'manual' check (char_length(source) <= 40),
  source_id text check (source_id is null or char_length(source_id) <= 80),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists run_events_source_key on public.run_events (source, source_id) where source_id is not null;
create index if not exists run_events_status_date_idx on public.run_events (status, event_date);
create index if not exists run_events_state_idx on public.run_events (state, event_date);

alter table public.run_events enable row level security;

-- Quem usa o app lê só as aprovadas e futuras; quem edita o conteúdo vê tudo.
drop policy if exists "run_events_select" on public.run_events;
create policy "run_events_select" on public.run_events
  for select using ((status = 'approved' and event_date >= current_date - 1) or admin_can('content'::text));

drop policy if exists "run_events_insert" on public.run_events;
create policy "run_events_insert" on public.run_events
  for insert with check (admin_can('content'::text));

drop policy if exists "run_events_update" on public.run_events;
create policy "run_events_update" on public.run_events
  for update using (admin_can('content'::text)) with check (admin_can('content'::text));

drop policy if exists "run_events_delete" on public.run_events;
create policy "run_events_delete" on public.run_events
  for delete using (admin_can('content'::text));

create or replace function public.run_events_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists run_events_touch on public.run_events;
create trigger run_events_touch before update on public.run_events
  for each row execute function public.run_events_touch();
