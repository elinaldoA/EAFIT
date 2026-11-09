-- Corrige trainer_update_client: a versao anterior atualizava profiles.weight e
-- profiles.height, colunas removidas em 20260729030000. Todo salvamento com
-- peso/altura falhava ("Nao foi possivel concluir"). Peso e altura vivem so em
-- auth.users.user_metadata.
create or replace function public.trainer_update_client(p_client uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_meta jsonb := '{}'::jsonb;
  v_val text;
  v_email text;
  v_old text;
  k text;
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  foreach k in array array['nome','peso','pesoAlvo','altura','idade','meta','nivel','weeklyGoal'] loop
    if p_data ? k and jsonb_typeof(p_data->k) <> 'null' then
      v_val := left(btrim(p_data->>k), 80);
      if k in ('peso','pesoAlvo','altura','idade','weeklyGoal') and v_val <> '' and v_val !~ '^[0-9]+([.,][0-9]+)?$' then
        raise exception 'invalid_data';
      end if;
      if k = 'meta' and v_val not in ('', 'massa','forca','emagrecer','definicao','saude','resistencia') then
        raise exception 'invalid_data';
      end if;
      if k = 'nivel' and v_val not in ('', 'iniciante','intermediario','avancado') then
        raise exception 'invalid_data';
      end if;
      if k = 'nome' and v_val = '' then raise exception 'invalid_data'; end if;
      if k <> 'nome' then v_val := replace(v_val, ',', '.'); end if;
      v_meta := v_meta || jsonb_build_object(k, v_val);
    end if;
  end loop;

  if p_data ? 'email' and jsonb_typeof(p_data->'email') <> 'null' then
    v_email := lower(btrim(p_data->>'email'));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
    select u.email::text into v_old from auth.users u where u.id = p_client;
    if v_email is distinct from lower(v_old) then
      if exists (select 1 from auth.users u where lower(u.email::text) = v_email and u.id <> p_client) then
        raise exception 'email_in_use';
      end if;
      update auth.users
        set email = v_email, email_change = '', email_change_token_new = '', updated_at = now()
        where id = p_client;
      update auth.identities
        set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email)), updated_at = now()
        where user_id = p_client and provider = 'email';
      update public.profiles set email = v_email, updated_at = now() where id = p_client;
    end if;
  end if;

  if v_meta <> '{}'::jsonb then
    update auth.users
      set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || v_meta, updated_at = now()
      where id = p_client;
  end if;
end;
$$;

revoke execute on function public.trainer_update_client(uuid, jsonb) from public, anon;
grant execute on function public.trainer_update_client(uuid, jsonb) to authenticated;
