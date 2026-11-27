-- EAFIT Arena: o herói (personagem) de cada pessoa.
--
-- Guarda só as escolhas de aparência, como números pequenos; quem sabe desenhar
-- cada opção é o app (app-react/src/lib/hero.js). A evolução visual (roupa,
-- equipamento e aura) NÃO é guardada: sai do nível, que o servidor já calcula.
-- Um herói por pessoa, o mesmo nos módulos Gym e Run. Só o dono lê e grava, e
-- a gravação passa por uma função que confere cada faixa de valores.

create table if not exists public.arena_heroes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  body smallint not null check (body between 1 and 3),
  skin smallint not null check (skin between 1 and 6),
  hair_style smallint not null check (hair_style between 1 and 6),
  hair_color smallint not null check (hair_color between 1 and 6),
  outfit smallint not null check (outfit between 1 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.arena_heroes enable row level security;

drop policy if exists "arena_heroes own" on public.arena_heroes;
create policy "arena_heroes own" on public.arena_heroes
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.arena_heroes from anon, authenticated;
grant select on public.arena_heroes to authenticated;

create or replace function public.arena_my_hero()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('body', h.body, 'skin', h.skin, 'hair_style', h.hair_style,
                            'hair_color', h.hair_color, 'outfit', h.outfit)
  from public.arena_heroes h where h.user_id = auth.uid();
$$;

create or replace function public.arena_save_hero(
  p_body int, p_skin int, p_hair_style int, p_hair_color int, p_outfit int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_body not between 1 and 3 or p_skin not between 1 and 6 or p_hair_style not between 1 and 6
     or p_hair_color not between 1 and 6 or p_outfit not between 1 and 6 then
    raise exception 'invalid_hero';
  end if;

  insert into public.arena_heroes (user_id, body, skin, hair_style, hair_color, outfit)
  values (uid, p_body, p_skin, p_hair_style, p_hair_color, p_outfit)
  on conflict (user_id) do update
    set body = excluded.body, skin = excluded.skin, hair_style = excluded.hair_style,
        hair_color = excluded.hair_color, outfit = excluded.outfit, updated_at = now();

  return jsonb_build_object('body', p_body, 'skin', p_skin, 'hair_style', p_hair_style,
                            'hair_color', p_hair_color, 'outfit', p_outfit);
end;
$$;

revoke execute on function public.arena_my_hero() from public, anon;
revoke execute on function public.arena_save_hero(int, int, int, int, int) from public, anon;
grant execute on function public.arena_my_hero() to authenticated;
grant execute on function public.arena_save_hero(int, int, int, int, int) to authenticated;
