-- EAFIT Run: desenho do percurso de cada corrida (app-react/src/modules/corrida/route.js).
-- Formato: trechos de pontos [lat, lon] em inteiros de 1e-5 grau. O app já
-- grava sem os primeiros e os últimos 200 m (para não mostrar onde a pessoa
-- mora) e só o desenha, sem mapa de fundo. Privado como o resto da linha
-- (política "own all" de public.runs) e apagado junto com a conta (cascade).

alter table public.runs
  add column if not exists route jsonb not null default '[]'::jsonb;

alter table public.runs drop constraint if exists runs_route_shape;
alter table public.runs add constraint runs_route_shape
  check (jsonb_typeof(route) = 'array' and jsonb_array_length(route) <= 200 and octet_length(route::text) <= 400000);
