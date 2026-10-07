-- Um treino por usuário por dia.
--
-- O app resolvia o treino do dia com select + insert sem garantia de unicidade:
-- duas abas/aparelhos abrindo juntos (ou o replay da fila offline) criavam duas
-- linhas, e a partir daí a leitura com maybeSingle() falhava para sempre.
--
-- 1) Junta os duplicados existentes: mantém o treino com mais séries registradas
--    (depois o concluído, depois o mais antigo), move para ele o que o outro
--    tinha e apaga os sobrantes.
-- 2) Cria o índice único que impede novas duplicatas.

do $$
declare
  dup record;
  keeper uuid;
begin
  for dup in
    select user_id, workout_date
    from public.workouts
    group by user_id, workout_date
    having count(*) > 1
  loop
    select w.id into keeper
    from public.workouts w
    where w.user_id = dup.user_id and w.workout_date = dup.workout_date
    order by (select count(*) from public.exercise_sets s where s.workout_id = w.id) desc,
             coalesce(w.completed, false) desc,
             w.created_at asc
    limit 1;

    -- Séries: só passa para o treino mantido as que ele ainda não tem
    -- (unique workout_id + exercise_name + set_number); o resto some no cascade.
    update public.exercise_sets s
    set workout_id = keeper
    where s.workout_id in (
            select w.id from public.workouts w
            where w.user_id = dup.user_id and w.workout_date = dup.workout_date and w.id <> keeper)
      and not exists (
            select 1 from public.exercise_sets k
            where k.workout_id = keeper
              and k.exercise_name = s.exercise_name
              and k.set_number = s.set_number);

    -- Só o treino mantido precisa dos logs de exercício; os dos outros são cópias.
    delete from public.workouts w
    where w.user_id = dup.user_id and w.workout_date = dup.workout_date and w.id <> keeper;
  end loop;
end $$;

create unique index if not exists workouts_user_date_uidx
  on public.workouts (user_id, workout_date);
