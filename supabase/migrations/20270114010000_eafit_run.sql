-- EAFIT Run (módulo de corrida do app, app-react/src/modules/corrida): cada
-- corrida registrada vira uma linha aqui, separada do plano de musculação.
-- Privada do usuário: ele lê, grava e apaga só o que é dele.
--
-- client_id é gerado no aparelho no início da corrida: a corrida que não
-- subiu sem internet é reenviada depois sem duplicar (upsert por user_id + client_id).
-- splits: segundos de cada km completo, medidos pelo GPS (vazio quando a
-- distância foi digitada). Nenhuma coordenada é guardada.

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 64),
  run_date date not null,
  started_at timestamptz not null,
  duration_s integer not null check (duration_s between 1 and 86400),
  distance_m integer not null default 0 check (distance_m between 0 and 500000),
  splits jsonb not null default '[]'::jsonb check (jsonb_typeof(splits) = 'array' and jsonb_array_length(splits) <= 500),
  kind text not null default 'livre'
    check (kind in ('livre', 'leve', 'longao', 'intervalado', 'ritmo', 'corre_caminha', 'prova')),
  program_week smallint check (program_week between 1 and 52),
  program_day smallint check (program_day between 0 and 6),
  gps boolean not null default false,
  effort smallint check (effort between 1 and 10),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists runs_user_date_idx on public.runs (user_id, run_date desc);

alter table public.runs enable row level security;

drop policy if exists "own all" on public.runs;
create policy "own all" on public.runs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.runs to authenticated;

-- Liberação dos módulos de esporte ainda não lançados (lib/sportModule.js):
-- a chave começa vazia; o painel (ou um update aqui) acrescenta 'corrida'.
insert into public.app_settings (key, value)
values ('modules', '{"enabled": []}'::jsonb)
on conflict (key) do nothing;
