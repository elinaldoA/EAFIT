-- Apagar erros do app (tela Erros do app → limpar antigos) só valia is_admin():
-- qualquer admin, até o papel "Só leitura", apagava direto pela API. Passa a
-- exigir a área 'admins', a mesma do RequireArea da tela. A leitura continua
-- para todo admin.
drop policy if exists "admin deletes" on public.client_errors;
create policy "admin deletes" on public.client_errors
  for delete to authenticated using ((select public.admin_can('admins')));
