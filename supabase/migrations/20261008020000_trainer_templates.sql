-- Modelos de treino do personal: ele salva um plano como modelo e depois envia
-- para um ou vários alunos de uma vez, ajustando só o que muda.
--
-- Mesmas regras do ambiente do personal: RLS ligado e sem policies, acesso só
-- por funções security definer. O envio em lote reaproveita
-- trainer_assign_plan, que já confere o vínculo ativo com cada aluno e valida o
-- conteúdo — então um aluno que não é do personal simplesmente é ignorado.

create table if not exists public.trainer_templates (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 60),
  duration_weeks int check (duration_weeks between 1 and 52),
  days jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists trainer_templates_idx on public.trainer_templates (trainer_id, created_at desc);
alter table public.trainer_templates enable row level security;

-- Salva um modelo (até 50 por personal). p_days no mesmo formato do plano:
-- [{ "dia", "foco", "exercicios": [{nome, series, reps, descanso, tecnica}] }]
create or replace function public.trainer_save_template(p_name text, p_days jsonb, p_weeks int default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  if p_name is null or length(btrim(p_name)) < 2 or length(btrim(p_name)) > 60 then raise exception 'invalid_name'; end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) not between 1 and 7 then
    raise exception 'invalid_days';
  end if;
  if p_weeks is not null and p_weeks not between 1 and 52 then raise exception 'invalid_duration'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_days) d
    where jsonb_typeof(d->'exercicios') <> 'array'
       or jsonb_array_length(d->'exercicios') not between 1 and 20
       or exists (select 1 from jsonb_array_elements(d->'exercicios') e where length(btrim(coalesce(e->>'nome', ''))) = 0)
  ) then
    raise exception 'invalid_exercises';
  end if;

  if (select count(*) from public.trainer_templates t where t.trainer_id = auth.uid()) >= 50 then
    raise exception 'too_many_templates';
  end if;

  insert into public.trainer_templates (trainer_id, name, duration_weeks, days)
  values (auth.uid(), btrim(p_name), p_weeks, p_days)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.trainer_templates()
returns table (tpl_id uuid, tpl_name text, tpl_weeks int, tpl_days jsonb, tpl_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  return query
    select t.id, t.name, t.duration_weeks, t.days, t.created_at
    from public.trainer_templates t
    where t.trainer_id = auth.uid()
    order by t.created_at desc;
end;
$$;

create or replace function public.trainer_delete_template(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  delete from public.trainer_templates t where t.id = p_id and t.trainer_id = auth.uid();
end;
$$;

-- Envia o mesmo treino a vários alunos (cada um vira o plano ativo dele).
-- Devolve os alunos que receberam; quem não é aluno ativo do personal é
-- ignorado. Tudo na mesma transação: se um falhar por conteúdo inválido, nenhum
-- é enviado.
create or replace function public.trainer_assign_plan_bulk(
  p_clients uuid[],
  p_name text,
  p_days jsonb,
  p_duration_weeks int default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_done uuid[] := '{}';
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  if p_clients is null or array_length(p_clients, 1) is null then raise exception 'no_recipients'; end if;
  if array_length(p_clients, 1) > 50 then raise exception 'too_many_recipients'; end if;

  for v_client in select distinct c from unnest(p_clients) c loop
    if public.is_trainer_of(v_client) then
      perform public.trainer_assign_plan(v_client, p_name, p_days, p_duration_weeks);
      v_done := v_done || v_client;
    end if;
  end loop;

  if array_length(v_done, 1) is null then raise exception 'no_recipients'; end if;
  return v_done;
end;
$$;

revoke execute on function public.trainer_save_template(text, jsonb, int) from public, anon;
revoke execute on function public.trainer_templates() from public, anon;
revoke execute on function public.trainer_delete_template(uuid) from public, anon;
revoke execute on function public.trainer_assign_plan_bulk(uuid[], text, jsonb, int) from public, anon;
grant execute on function public.trainer_save_template(text, jsonb, int) to authenticated;
grant execute on function public.trainer_templates() to authenticated;
grant execute on function public.trainer_delete_template(uuid) to authenticated;
grant execute on function public.trainer_assign_plan_bulk(uuid[], text, jsonb, int) to authenticated;
