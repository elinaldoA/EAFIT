-- Resposta do admin ao feedback: o texto fica na própria linha do feedback
-- (o aluno lê em Perfil → Enviar feedback) e o aviso chega por push e pela
-- central de avisos, enviado pelo painel via admin-broadcast.
alter table public.feedback
  add column if not exists admin_reply text check (admin_reply is null or length(btrim(admin_reply)) between 1 and 500),
  add column if not exists replied_at timestamptz;

-- O usuário não pode se auto-responder: o insert exige admin_reply vazio
-- (o update continua exclusivo do admin).
drop policy if exists "own insert" on public.feedback;
create policy "own insert" on public.feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'novo'
    and admin_note is null
    and admin_reply is null
    and (select count(*) from public.feedback f
         where f.user_id = auth.uid() and f.created_at > now() - interval '1 day') < 5
  );

-- A fila do painel passa a trazer a resposta já enviada. O tipo de retorno
-- muda, então a função precisa ser recriada.
drop function if exists public.admin_list_feedback(text, text, int, int);
create function public.admin_list_feedback(
  status_filter text default null,
  kind_filter text default null,
  page_size int default 50,
  page_offset int default 0
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  nome text,
  apelido text,
  kind text,
  message text,
  context text,
  status text,
  admin_note text,
  admin_reply text,
  replied_at timestamptz,
  created_at timestamptz,
  resolved_at timestamptz,
  total_count bigint,
  novos bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select f.id, f.user_id, u.email::text, u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'apelido',
           f.kind, f.message, f.context, f.status, f.admin_note, f.admin_reply, f.replied_at,
           f.created_at, f.resolved_at,
           count(*) over()::bigint,
           (select count(*) from public.feedback n where n.status = 'novo')
    from public.feedback f
    join auth.users u on u.id = f.user_id
    where (status_filter is null or status_filter = '' or f.status = status_filter)
      and (kind_filter is null or kind_filter = '' or f.kind = kind_filter)
    order by (f.status = 'resolvido'), f.created_at desc
    limit page_size offset page_offset;
end;
$$;

grant execute on function public.admin_list_feedback(text, text, int, int) to authenticated;
