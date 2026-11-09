-- Recados agendados: o identificador do aluno nao pode sobreviver a exclusao
-- da conta dele.
--
-- trainer_scheduled_messages.client_ids e uma lista de ids sem chave
-- estrangeira, entao a exclusao de conta (que apaga trainer_clients pelas duas
-- pontas) deixava o id do aluno para tras. Agora, ao apagar uma linha de
-- trainer_clients, o id sai das listas daquele personal e o agendamento que
-- ficar sem nenhum destinatario e apagado. Atencao: lista vazia NAO pode virar
-- null (null significa "todos os alunos"), por isso a linha e removida.
--
-- Encerrar o vinculo so marca status = 'revoked' (nao apaga a linha), entao
-- nao dispara isto: o envio ja confere o vinculo ativo na hora de sair.

create or replace function public.trainer_scheduled_drop_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trainer_scheduled_messages s
     set client_ids = array_remove(s.client_ids, old.client_id)
   where s.trainer_id = old.trainer_id
     and s.client_ids is not null
     and old.client_id = any(s.client_ids);

  delete from public.trainer_scheduled_messages s
   where s.trainer_id = old.trainer_id
     and s.client_ids is not null
     and cardinality(s.client_ids) = 0;

  return old;
end;
$$;

revoke execute on function public.trainer_scheduled_drop_client() from public, anon, authenticated;

drop trigger if exists trainer_clients_scheduled_purge on public.trainer_clients;
create trigger trainer_clients_scheduled_purge
  after delete on public.trainer_clients
  for each row execute function public.trainer_scheduled_drop_client();

-- Limpeza unica: ids que ja ficaram para tras (contas que nao existem mais).
update public.trainer_scheduled_messages s
   set client_ids = coalesce((
         select array_agg(c)
         from unnest(s.client_ids) c
         where exists (select 1 from auth.users u where u.id = c)
       ), '{}')
 where s.client_ids is not null
   and exists (select 1 from unnest(s.client_ids) c where not exists (select 1 from auth.users u where u.id = c));

delete from public.trainer_scheduled_messages s
 where s.client_ids is not null and cardinality(s.client_ids) = 0;
