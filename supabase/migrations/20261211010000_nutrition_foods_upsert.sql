-- Atalhos de alimentos agora são gravados por upsert (o id nasce no aparelho,
-- para a fila offline não duplicar). O limite de 20 só vale para atalho novo:
-- editar um existente com a lista cheia não pode falhar.
create or replace function public.limit_nutrition_foods() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.nutrition_foods where id = new.id) then
    return new;
  end if;
  if (select count(*) from public.nutrition_foods where user_id = new.user_id) >= 20 then
    raise exception 'limite de 20 atalhos de alimentos' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
