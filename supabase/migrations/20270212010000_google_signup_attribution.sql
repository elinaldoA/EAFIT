-- Login com Google: vínculo de embaixador e de personal na primeira volta.
--
-- No cadastro por e-mail o app manda ref/refSource/personal em user_metadata
-- junto com o signUp, e os gatilhos abaixo leem isso no INSERT em auth.users.
-- No login com Google o Supabase cria a conta sem esses dados; o app os grava
-- logo depois da volta (updateUser), então os mesmos gatilhos passam a rodar
-- também no UPDATE de raw_user_meta_data.
--
-- Só vale para conta recém-criada (menos de 1 dia): senão qualquer pessoa
-- poderia se vincular a um embaixador/personal quando quisesse. Repetir é
-- seguro: os dois inserts já são "on conflict (user_id) do nothing".
-- (A campanha de parceiro e o utm são lidos de user_metadata na hora da
-- consulta; não precisam de gatilho.)

drop trigger if exists link_ambassador_on_signup_update on auth.users;
create trigger link_ambassador_on_signup_update
  after update of raw_user_meta_data on auth.users
  for each row
  when (
    new.raw_user_meta_data->>'ref' is not null
    and new.raw_user_meta_data is distinct from old.raw_user_meta_data
    and new.created_at > now() - interval '1 day'
  )
  execute function public.link_ambassador_on_signup();

drop trigger if exists track_trainer_invite_on_signup_update on auth.users;
create trigger track_trainer_invite_on_signup_update
  after update of raw_user_meta_data on auth.users
  for each row
  when (
    new.raw_user_meta_data->>'personal' is not null
    and new.raw_user_meta_data is distinct from old.raw_user_meta_data
    and new.created_at > now() - interval '1 day'
  )
  execute function public.track_trainer_invite_on_signup();
