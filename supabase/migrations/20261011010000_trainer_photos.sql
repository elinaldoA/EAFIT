-- Fotos de progresso compartilhadas com o personal.
--
-- Fotos são mais sensíveis que treino/peso/medidas, então o compartilhamento
-- é uma autorização À PARTE, desligada por padrão: só o aluno liga (e desliga)
-- em Perfil → Meu personal. A autorização vale só para o vínculo atual: ao
-- encerrar e vincular de novo (ou trocar de personal) ela volta a ficar
-- desligada.
--
-- O arquivo continua no bucket privado progress-photos, na pasta do aluno. O
-- personal ganha só LEITURA (policy extra de select) enquanto o vínculo está
-- ativo e a autorização ligada; ele nunca grava nem apaga foto do aluno.
-- Fotos antigas (base64 na coluna image_data) não são compartilhadas.

alter table public.trainer_clients
  add column if not exists share_photos boolean not null default false;

-- Reativar um vínculo (ou criar um novo) sempre começa sem compartilhar.
create or replace function public.trainer_clients_reset_share()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    new.share_photos := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trainer_clients_reset_share on public.trainer_clients;
create trigger trainer_clients_reset_share
  before update of status on public.trainer_clients
  for each row execute function public.trainer_clients_reset_share();

-- Aluno liga/desliga o compartilhamento (só do vínculo ativo dele).
create or replace function public.set_share_photos(p_share boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.trainer_clients c set share_photos = coalesce(p_share, false)
  where c.client_id = auth.uid() and c.status = 'active';
$$;

create or replace function public.my_share_photos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select c.share_photos from public.trainer_clients c
                   where c.client_id = auth.uid() and c.status = 'active'), false);
$$;

-- Personal: fotos de um aluno dele. Sem autorização, devolve uma única linha
-- com ph_shared = false (pra a ficha explicar o motivo).
create or replace function public.trainer_client_photos(p_client uuid)
returns table (ph_shared boolean, ph_id uuid, ph_date date, ph_note text, ph_path text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shared boolean;
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  select c.share_photos into v_shared
  from public.trainer_clients c
  where c.trainer_id = auth.uid() and c.client_id = p_client and c.status = 'active';

  if not coalesce(v_shared, false) then
    return query select false, null::uuid, null::date, null::text, null::text;
    return;
  end if;

  return query
    select true, p.id, p.photo_date, p.note, p.storage_path
    from public.progress_photos p
    where p.user_id = p_client and p.storage_path is not null
    order by p.photo_date asc, p.created_at asc;
end;
$$;

-- Leitura dos arquivos pelo personal (assinar URL passa por esta policy).
drop policy if exists "progress_photos_trainer_select" on storage.objects;
create policy "progress_photos_trainer_select"
  on storage.objects for select
  using (
    bucket_id = 'progress-photos'
    and exists (
      select 1
      from public.trainer_clients tc
      join public.trainers t on t.user_id = tc.trainer_id
      where tc.trainer_id = (select auth.uid())
        and tc.status = 'active'
        and tc.share_photos
        and tc.client_id::text = (storage.foldername(name))[1]
    )
  );

revoke execute on function public.set_share_photos(boolean) from public, anon;
revoke execute on function public.my_share_photos() from public, anon;
revoke execute on function public.trainer_client_photos(uuid) from public, anon;
grant execute on function public.set_share_photos(boolean) to authenticated;
grant execute on function public.my_share_photos() to authenticated;
grant execute on function public.trainer_client_photos(uuid) to authenticated;
