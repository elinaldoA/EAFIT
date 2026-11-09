-- EAFIT Run: subida e descida de cada km.
--
-- runs.km_elev: lista [[subida, descida], ...] em metros, uma entrada por km
-- completo (a mesma ordem de runs.splits), pela altitude do GPS já suavizada
-- no aparelho (modules/corrida/elevation.js). null em corrida sem GPS ou sem
-- altitude. O app mostra ao lado do ritmo de cada km no histórico e no fim da
-- corrida. Privado como o resto da linha (política "own all" de public.runs) e
-- apagado junto com a conta (cascade). O app funciona antes desta migration:
-- sem a coluna, a corrida salva sem a subida por km.

alter table public.runs
  add column if not exists km_elev jsonb;

alter table public.runs drop constraint if exists runs_km_elev_shape;
alter table public.runs add constraint runs_km_elev_shape
  check (km_elev is null or (jsonb_typeof(km_elev) = 'array' and jsonb_array_length(km_elev) <= 600 and octet_length(km_elev::text) <= 12000));
