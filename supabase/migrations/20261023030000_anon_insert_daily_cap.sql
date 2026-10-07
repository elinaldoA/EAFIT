-- Teto diário para as inserções anônimas (page_visits e landing_events).
--
-- Qualquer visitante pode inserir nessas duas tabelas (é o ponto: medir o topo
-- do funil sem login). Sem limite, um script podia encher as tabelas e deixar
-- as consultas do painel cada vez mais lentas. Este teto limita o DANO: depois
-- de N inserções no dia (fuso de Brasília), as seguintes são recusadas até o
-- dia seguinte.
--
-- O que ele NÃO faz: impedir que alguém infle os números dentro do teto. Sem
-- identificar o visitante (IP, cookie, conta) isso não tem como ser resolvido
-- aqui — por isso as métricas seguem sendo indicativas, como já dito nas
-- migrations originais. Se o teto for atingido, o resto do dia fica sem
-- contagem (o app e a landing ignoram a falha em silêncio), então ele precisa
-- ser bem acima do tráfego real.
--
-- Contagem em tabela própria (uma linha por tabela por dia), e não um count(*)
-- na policy: contar milhares de linhas a cada inserção seria o próprio gargalo
-- que o teto quer evitar.

create table if not exists public.anon_insert_counters (
  tbl text not null,
  day date not null,
  n integer not null default 0,
  primary key (tbl, day)
);

-- Só a função abaixo (security definer) mexe aqui.
alter table public.anon_insert_counters enable row level security;
revoke all on public.anon_insert_counters from anon, authenticated;

create or replace function public.enforce_daily_insert_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer := tg_argv[0]::integer;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  used integer;
begin
  -- Incrementa só se ainda houver folga; sem retorno = teto atingido.
  insert into public.anon_insert_counters as c (tbl, day, n)
  values (tg_table_name, today, 1)
  on conflict (tbl, day) do update set n = c.n + 1 where c.n < cap
  returning c.n into used;

  if used is null then
    raise exception 'daily_cap_reached' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_daily_insert_cap() from public, anon, authenticated;

-- Folga grande sobre o tráfego esperado (1 visita por página por dia por
-- navegador; poucos eventos por sessão na landing).
drop trigger if exists page_visits_daily_cap on public.page_visits;
create trigger page_visits_daily_cap
  before insert on public.page_visits
  for each row execute function public.enforce_daily_insert_cap(5000);

drop trigger if exists landing_events_daily_cap on public.landing_events;
create trigger landing_events_daily_cap
  before insert on public.landing_events
  for each row execute function public.enforce_daily_insert_cap(30000);
