-- Registro dos e-mails enviados pelas Edge Functions (Gmail SMTP).
--
-- O Gmail não devolve entrega, abertura nem bounce, então o que dá pra medir é
-- o que o próprio envio sabe: saiu, falhou, foi pulado (secrets sem configurar)
-- e quem se descadastrou. Os cliques aparecem nas visitas: os links do e-mail
-- levam ?origem=email&utm_campaign=<kind> (ver _shared/emailTracking.ts) e
-- caem em "Campanha × criativo" e no painel de origens.
--
-- Não guarda endereço nem usuário: só o tipo de e-mail, o resultado e o dia.
-- Quem grava é a Edge Function (service role); ninguém mais escreve aqui.

create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  sent_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  kind text not null check (kind ~ '^[a-z0-9-]{1,40}$'),
  status text not null check (status in ('sent', 'error', 'skipped', 'unsubscribed')),
  created_at timestamptz not null default now()
);

create index if not exists email_log_sent_on_idx on public.email_log (sent_on);

alter table public.email_log enable row level security;

drop policy if exists "admin reads email log" on public.email_log;
create policy "admin reads email log" on public.email_log
  for select using (public.is_admin());

revoke all on public.email_log from anon, authenticated;

-- Por tipo e resultado nos últimos `days_back` dias (null/<=0 = tudo), com
-- quantos foram hoje (o Gmail corta em ~500 por dia).
create or replace function public.admin_email_stats(days_back int default 30)
returns table (kind text, status text, total bigint, today bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  today_sp date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null
                     else today_sp - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select l.kind, l.status, count(*)::bigint, (count(*) filter (where l.sent_on = today_sp))::bigint
    from public.email_log l
    where since is null or l.sent_on >= since
    group by l.kind, l.status
    order by count(*) desc, l.kind, l.status;
end;
$$;

grant execute on function public.admin_email_stats(int) to authenticated;
