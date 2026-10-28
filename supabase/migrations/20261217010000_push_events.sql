-- Recebimento e clique das notificações push dos envios manuais/agendados.
--
-- O serviço de push (FCM, Mozilla, Apple) só diz que aceitou a mensagem, não
-- que o aparelho a mostrou. Quem sabe é o service worker do app: ao receber o
-- push ele avisa a Edge Function push-event ('received') e, ao tocar na
-- notificação, avisa de novo ('clicked'). O envio leva o id da campanha no
-- payload (o mesmo de user_notifications.campaign), então o painel Resultados
-- junta as duas medições.
--
-- O service worker não tem sessão: a função identifica a pessoa pelo endpoint
-- da inscrição push do aparelho (segredo que só o aparelho e o servidor têm).
-- Só conta o que chegou a um aparelho com a versão nova do app; quem ainda usa
-- o service worker antigo aparece só nos envios, sem recebimento.

create table if not exists public.push_events (
  campaign uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null check (event in ('received', 'clicked')),
  created_at timestamptz not null default now(),
  primary key (campaign, user_id, event)
);

create index if not exists push_events_created_idx on public.push_events (created_at);

alter table public.push_events enable row level security;
revoke all on public.push_events from anon, authenticated;

-- Chamada só pela Edge Function (service role). Endpoint desconhecido (inscrição
-- já apagada) não grava nada; repetir o mesmo evento é ignorado.
create or replace function public.push_event_record(p_endpoint text, p_campaign uuid, p_event text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if p_event not in ('received', 'clicked') then return false; end if;
  select s.user_id into uid from public.push_subscriptions s where s.endpoint = p_endpoint;
  if uid is null then return false; end if;

  insert into public.push_events (campaign, user_id, event)
  values (p_campaign, uid, p_event)
  on conflict do nothing;
  return true;
end;
$$;

revoke execute on function public.push_event_record(text, uuid, text) from public, anon, authenticated;
grant execute on function public.push_event_record(text, uuid, text) to service_role;

-- Painel: por campanha, quantas pessoas receberam e quantas tocaram. Admins
-- ficam de fora (como em admin_campaign_effect). days_back <= 0 = desde sempre.
create or replace function public.admin_push_events(days_back int default 30)
returns table (pe_campaign uuid, pe_received bigint, pe_clicked bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := case when coalesce(days_back, 30) <= 0 then '-infinity'::timestamptz
                            else now() - make_interval(days => least(days_back, 3650)) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select e.campaign,
           count(*) filter (where e.event = 'received'),
           count(*) filter (where e.event = 'clicked')
    from public.push_events e
    left join public.profiles p on p.id = e.user_id
    where e.created_at >= since and coalesce(p.is_admin, false) = false
    group by e.campaign;
end;
$$;

revoke execute on function public.admin_push_events(int) from public, anon;
grant execute on function public.admin_push_events(int) to authenticated;
