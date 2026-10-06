-- Painel admin: alunos de um personal (página "Personais"). Só admin; mostra
-- quem é aluno ativo, desde quando e quantos dias treinou nos últimos 30 —
-- sem expor dados de saúde (peso, medidas, fotos, recados).

create or replace function public.admin_trainer_clients(p_trainer uuid)
returns table (tcl_user uuid, tcl_email text, tcl_name text, tcl_since timestamptz, tcl_days30 bigint)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select c.client_id, u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), u.email::text),
           c.linked_at,
           (select count(*) from public.training_days() d where d.user_id = c.client_id and d.day >= today - 30)
    from public.trainer_clients c
    join auth.users u on u.id = c.client_id
    where c.trainer_id = p_trainer and c.status = 'active'
    order by c.linked_at desc;
end;
$$;

revoke execute on function public.admin_trainer_clients(uuid) from public, anon;
grant execute on function public.admin_trainer_clients(uuid) to authenticated;
