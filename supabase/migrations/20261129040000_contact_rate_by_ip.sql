-- Formulário de contato: limite por IP, além do teto diário global.
--
-- Até aqui só existia o teto global (200/dia, enforce_daily_insert_cap):
-- uma pessoa sozinha conseguia gastar a cota do dia e calar o formulário
-- para todo mundo. Agora cada IP manda no máximo 3 mensagens por hora e 10
-- por dia. O teto global sobe para 500 e fica só como última barreira contra
-- ataque espalhado por muitos IPs.
--
-- O IP vem de request_ip() (o mesmo das visitas) e fica numa tabela à parte,
-- apagada depois de 24 h pelo próprio trigger: a mensagem em si não guarda IP.
-- Sem IP identificável (chamada interna), vale só o teto global.
--
-- Triggers BEFORE disparam em ordem alfabética: contact_messages_by_ip roda
-- antes de contact_messages_daily_cap, então quem é barrado pelo IP não
-- consome a cota global.

create table if not exists public.contact_rate_log (
  ip inet not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_rate_log_ip_idx on public.contact_rate_log (ip, created_at);

alter table public.contact_rate_log enable row level security;
revoke all on public.contact_rate_log from anon, authenticated;

create or replace function public.contact_messages_by_ip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip inet := public.request_ip();
  v_hour integer;
  v_day integer;
begin
  delete from public.contact_rate_log where created_at < now() - interval '1 day';
  if v_ip is null then
    return new;
  end if;

  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
  into v_hour, v_day
  from public.contact_rate_log
  where ip = v_ip;

  if v_hour >= 3 or v_day >= 10 then
    raise exception 'contact_rate_limited' using errcode = '54000';
  end if;

  insert into public.contact_rate_log (ip) values (v_ip);
  return new;
end;
$$;

revoke execute on function public.contact_messages_by_ip() from public, anon, authenticated;

drop trigger if exists contact_messages_by_ip on public.contact_messages;
create trigger contact_messages_by_ip
  before insert on public.contact_messages
  for each row execute function public.contact_messages_by_ip();

drop trigger if exists contact_messages_daily_cap on public.contact_messages;
create trigger contact_messages_daily_cap
  before insert on public.contact_messages
  for each row execute function public.enforce_daily_insert_cap('500');
