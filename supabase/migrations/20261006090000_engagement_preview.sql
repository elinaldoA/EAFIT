-- Prévia das notificações automáticas no painel: "quem receberia agora".
-- Embrulha engagement_candidates() (que só o service_role executa) numa função
-- que só admin chama, devolvendo também o e-mail. Somente leitura: não envia
-- nada nem grava no log. Respeita tudo que a função original respeita (regra
-- ligada, opt-out, push ativo, intervalo mínimo, 1 por dia); ignora apenas o
-- horário e o dia da semana da regra.
create or replace function public.admin_engagement_preview(rule_kind text)
returns table (user_id uuid, email text, nome text, vars jsonb)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select c.user_id, u.email::text, c.nome, c.vars
    from public.engagement_candidates(rule_kind) c
    join auth.users u on u.id = c.user_id
    order by u.email;
end;
$$;

grant execute on function public.admin_engagement_preview(text) to authenticated;
