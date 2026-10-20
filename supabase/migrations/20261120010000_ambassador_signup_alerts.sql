-- Aviso de novos cadastros para embaixadores e influenciadores: a Edge
-- Function send-ambassador-alerts roda de hora em hora (pg_cron), pergunta
-- quem ganhou contas novas pelo link desde o último aviso e manda um push só
-- com o número ("🎉 2 novas contas pelo seu link") — nunca quem se cadastrou.
-- Só o influenciador recebe o push; a função marca o embaixador como avisado
-- sem enviar nada.
--
-- ambassadors.notified_until marca até onde a pessoa já foi avisada. Só avança
-- depois que o push chega a pelo menos um aparelho, então quem ainda não ativou
-- as notificações recebe o acumulado quando ativar. Linhas existentes começam
-- em now(): ninguém recebe aviso de cadastro antigo.

alter table public.ambassadors
  add column if not exists notified_until timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Quem tem cadastro novo pelo link (só o backend chama)
-- ---------------------------------------------------------------------------
create or replace function public.ambassador_signup_candidates()
returns table (
  as_id uuid, as_user uuid, as_kind text, as_new bigint, as_total bigint, as_until timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.user_id, a.kind,
    count(*) filter (where r.linked_at > a.notified_until),
    count(*),
    max(r.linked_at)
  from public.ambassadors a
  join public.ambassador_referrals r on r.ambassador_id = a.id
  where a.active and a.user_id is not null
  group by a.id, a.user_id, a.kind, a.notified_until
  having count(*) filter (where r.linked_at > a.notified_until) > 0;
$$;

create or replace function public.ambassador_mark_notified(p_id uuid, p_until timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ambassadors
  set notified_until = greatest(notified_until, p_until)
  where id = p_id;
$$;

revoke execute on function public.ambassador_signup_candidates() from public, anon, authenticated;
revoke execute on function public.ambassador_mark_notified(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ambassador_signup_candidates() to service_role;
grant execute on function public.ambassador_mark_notified(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Cron de hora em hora (minuto 5, para não coincidir com send-trainer-alerts).
-- Pré-requisito: publicar a Edge Function send-ambassador-alerts (Verify JWT
-- desligado; autenticada pelo header x-cron-secret, igual às outras). Dentro
-- da função só se avisa entre 8h e 20h de Brasília.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'send-ambassador-alerts-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-ambassador-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
