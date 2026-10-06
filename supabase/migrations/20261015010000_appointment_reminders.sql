-- Lembretes de aula por push, para o aluno E para o personal.
--
-- A Edge Function send-appointment-reminders roda a cada 15 minutos (pg_cron) e
-- pergunta ao banco o que deve ser avisado:
--   • 'day'  — a aula é nas próximas 24 h (só se foi marcada com mais de 24 h
--              de antecedência, senão o aviso de "aula marcada" já basta);
--   • 'hour' — a aula é na próxima hora (só se foi marcada com mais de 1 h de
--              antecedência).
-- Cada lembrete sai uma vez por aula, tipo e destinatário
-- (appointment_reminder_log), e só é marcado depois de entregue a pelo menos um
-- aparelho: quem ainda não ativou as notificações recebe quando ativar, se
-- ainda estiver na janela.
--
-- A função de candidatos é só do service_role (a Edge Function). Colunas de
-- saída com prefixo ar_*.

create table if not exists public.appointment_reminder_log (
  appointment_id uuid not null references public.trainer_appointments(id) on delete cascade,
  kind text not null check (kind in ('day', 'hour')),
  recipient uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (appointment_id, kind, recipient)
);

alter table public.appointment_reminder_log enable row level security;

create or replace function public.appointment_reminder_candidates()
returns table (
  ar_appt uuid, ar_kind text, ar_user uuid, ar_role text, ar_other text,
  ar_starts timestamptz, ar_place text, ar_status text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with due as (
    select a.*,
           case
             when a.starts_at > now() and a.starts_at <= now() + interval '1 hour'
                  and a.created_at < a.starts_at - interval '1 hour' then 'hour'
             when a.starts_at > now() + interval '1 hour' and a.starts_at <= now() + interval '24 hours'
                  and a.created_at < a.starts_at - interval '24 hours' then 'day'
           end as kind
    from public.trainer_appointments a
    where a.status in ('pending', 'confirmed')
      and a.starts_at > now() and a.starts_at <= now() + interval '24 hours'
      and exists (select 1 from public.trainer_clients c
                  where c.trainer_id = a.trainer_id and c.client_id = a.client_id and c.status = 'active')
  ),
  pairs as (
    select d.id, d.kind, d.client_id as uid, 'client'::text as role, d.trainer_id as other_id,
           d.starts_at, d.place, d.status
    from due d where d.kind is not null
    union all
    select d.id, d.kind, d.trainer_id, 'trainer', d.client_id,
           d.starts_at, d.place, d.status
    from due d where d.kind is not null
  )
  select p.id, p.kind, p.uid, p.role,
         coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''),
                  case when p.role = 'client' then 'seu personal' else 'o aluno' end),
         p.starts_at, p.place, p.status
  from pairs p
  join auth.users u on u.id = p.other_id
  where not exists (
    select 1 from public.appointment_reminder_log l
    where l.appointment_id = p.id and l.kind = p.kind and l.recipient = p.uid
  );
$$;

revoke execute on function public.appointment_reminder_candidates() from public, anon, authenticated;
grant execute on function public.appointment_reminder_candidates() to service_role;

-- ---------------------------------------------------------------------------
-- Cron a cada 15 minutos. Pré-requisito: publicar a Edge Function
-- send-appointment-reminders (Verify JWT desligado; autenticada pelo header
-- x-cron-secret, igual às outras).
-- ---------------------------------------------------------------------------
select cron.schedule(
  'send-appointment-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
