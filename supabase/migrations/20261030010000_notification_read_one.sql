-- Central de avisos: o aluno passa a marcar como lido um aviso por vez (antes
-- abrir o sino marcava todos). mark_notifications_read() continua valendo
-- para o "marcar todos". Só mexe em aviso do próprio usuário.
create or replace function public.mark_notification_read(p_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_notifications
  set read_at = now()
  where id = p_id and user_id = auth.uid() and read_at is null;
$$;

revoke execute on function public.mark_notification_read(bigint) from public, anon;
grant execute on function public.mark_notification_read(bigint) to authenticated;
