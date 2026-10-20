-- Verificação de CREF dos personais (Pessoas → Personais → Verificação).
-- Quem é personal pede acesso pelo app (Perfil → Sou personal trainer) com
-- nome completo e CREF ("012345-G/SP"). O admin confere na consulta pública do
-- CONFEF e aprova (libera o modo personal com o CREF marcado como verificado)
-- ou recusa com motivo. A pessoa recebe o resultado na caixa do app.
-- Personais liberados antes disto podem ter o CREF registrado pelo painel.

alter table public.trainers
  add column if not exists cref text,
  add column if not exists cref_verified_at timestamptz,
  add column if not exists cref_verified_by uuid references auth.users(id) on delete set null;

create table if not exists public.trainer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 5 and 120),
  cref text not null check (cref ~ '^[0-9]{3,6}-[GP]/[A-Z]{2}$'),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  reason text not null default '' check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
create unique index if not exists trainer_requests_one_pending on public.trainer_requests (user_id) where status = 'pendente';
create index if not exists trainer_requests_status_idx on public.trainer_requests (status, created_at);

alter table public.trainer_requests enable row level security;
drop policy if exists "own trainer requests" on public.trainer_requests;
create policy "own trainer requests" on public.trainer_requests for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.trainer_requests from anon;

-- "012345 g sp", "12345-G/sp" → "012345-G/SP" (número com 6 dígitos), ou null.
create or replace function public.normalize_cref(p text)
returns text
language sql
immutable
as $$
  select case when m is null then null else lpad(m[1], 6, '0') || '-' || m[2] || '/' || m[3] end
  from (select regexp_match(upper(coalesce(p, '')), '^\s*([0-9]{3,6})\s*[-/ ]?\s*([GP])\s*[-/ ]?\s*([A-Z]{2})\s*$') as m) x;
$$;

create or replace function public.request_trainer_access(p_name text, p_cref text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cref text := public.normalize_cref(p_cref);
begin
  if auth.uid() is null then raise exception 'not_authorized'; end if;
  if exists (select 1 from public.trainers where user_id = auth.uid()) then raise exception 'already_trainer'; end if;
  if v_cref is null then raise exception 'invalid_cref'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 5 and 120 then raise exception 'invalid_name'; end if;
  if exists (select 1 from public.trainer_requests where user_id = auth.uid() and status = 'pendente') then
    raise exception 'already_pending';
  end if;
  insert into public.trainer_requests (user_id, full_name, cref, note)
  values (auth.uid(), btrim(p_name), v_cref, left(btrim(coalesce(p_note, '')), 500));
end;
$$;
revoke execute on function public.request_trainer_access(text, text, text) from public, anon;
grant execute on function public.request_trainer_access(text, text, text) to authenticated;

-- Situação para o app: 'personal' (já liberado), o último pedido, ou nada.
create or replace function public.my_trainer_request()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.trainers t where t.user_id = auth.uid()) then jsonb_build_object('status', 'personal')
    else (select jsonb_build_object('status', r.status, 'cref', r.cref, 'reason', r.reason, 'created_at', r.created_at)
          from public.trainer_requests r where r.user_id = auth.uid() order by r.created_at desc limit 1)
  end;
$$;
revoke execute on function public.my_trainer_request() from public, anon;
grant execute on function public.my_trainer_request() to authenticated;

-- Fila do painel, com dados da conta para ajudar a decidir.
create or replace function public.admin_trainer_requests(p_status text default 'pendente')
returns table (
  tr_id uuid, tr_user uuid, tr_email text, tr_name text, tr_cref text, tr_note text, tr_status text, tr_reason text,
  tr_created timestamptz, tr_decided timestamptz, tr_decided_by text, tr_account_created timestamptz, tr_previous bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
    select r.id, r.user_id, u.email::text, r.full_name, r.cref, r.note, r.status, r.reason,
           r.created_at, r.decided_at, d.email::text, u.created_at,
           (select count(*) from public.trainer_requests o where o.user_id = r.user_id and o.id <> r.id)
    from public.trainer_requests r
    join auth.users u on u.id = r.user_id
    left join auth.users d on d.id = r.decided_by
    where p_status is null or r.status = p_status
    order by case when r.status = 'pendente' then r.created_at end asc nulls last, r.decided_at desc
    limit 200;
end;
$$;
revoke execute on function public.admin_trainer_requests(text) from public, anon;
grant execute on function public.admin_trainer_requests(text) to authenticated;

create or replace function public.admin_decide_trainer_request(p_id uuid, p_approve boolean, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.trainer_requests;
begin
  if not public.admin_can('users') then raise exception 'not_authorized'; end if;
  select * into r from public.trainer_requests where id = p_id for update;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status <> 'pendente' then raise exception 'already_decided'; end if;
  if not p_approve and char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  update public.trainer_requests
     set status = case when p_approve then 'aprovado' else 'recusado' end,
         reason = left(btrim(coalesce(p_reason, '')), 300), decided_at = now(), decided_by = auth.uid()
   where id = p_id;

  if p_approve then
    perform public.admin_set_trainer(r.user_id, true);
    update public.trainers set cref = r.cref, cref_verified_at = now(), cref_verified_by = auth.uid() where user_id = r.user_id;
    insert into public.user_notifications (user_id, kind, title, body)
    values (r.user_id, 'aviso', '✅ Acesso de personal liberado',
            'Seu CREF foi confirmado. Reabra o app e toque em 🧑‍🏫 Personal, no topo, para convidar seus alunos.');
  else
    insert into public.user_notifications (user_id, kind, title, body)
    values (r.user_id, 'aviso', 'Pedido de acesso de personal',
            'Não conseguimos confirmar seu pedido: ' || btrim(p_reason) || ' Você pode enviar um novo pedido em Perfil → Sou personal trainer.');
  end if;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), r.user_id, case when p_approve then 'approveTrainerRequest' else 'rejectTrainerRequest' end,
          jsonb_build_object('cref', r.cref, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;
revoke execute on function public.admin_decide_trainer_request(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_trainer_request(uuid, boolean, text) to authenticated;

-- CREF de um personal já liberado (vazio apaga). Gravar = verificado agora.
create or replace function public.admin_set_trainer_cref(p_user uuid, p_cref text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cref text := public.normalize_cref(p_cref);
begin
  if not public.admin_can('users') then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.trainers where user_id = p_user) then raise exception 'not_trainer'; end if;
  if btrim(coalesce(p_cref, '')) <> '' and v_cref is null then raise exception 'invalid_cref'; end if;
  update public.trainers
     set cref = v_cref,
         cref_verified_at = case when v_cref is null then null else now() end,
         cref_verified_by = case when v_cref is null then null else auth.uid() end
   where user_id = p_user;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), p_user, 'setTrainerCref', jsonb_build_object('cref', v_cref));
  return v_cref;
end;
$$;
revoke execute on function public.admin_set_trainer_cref(uuid, text) from public, anon;
grant execute on function public.admin_set_trainer_cref(uuid, text) to authenticated;

-- Personais e o CREF de cada um (para a lista "sem CREF verificado").
create or replace function public.admin_trainer_crefs()
returns table (tc_user uuid, tc_email text, tc_code text, tc_cref text, tc_verified_at timestamptz, tc_since timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
    select t.user_id, u.email::text, t.code, t.cref, t.cref_verified_at, t.created_at
    from public.trainers t join auth.users u on u.id = t.user_id
    order by t.cref_verified_at nulls first, t.created_at;
end;
$$;
revoke execute on function public.admin_trainer_crefs() from public, anon;
grant execute on function public.admin_trainer_crefs() to authenticated;
