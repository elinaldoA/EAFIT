-- EAFIT Run: clima no começo da corrida.
--
-- runs.weather: { "t": °C, "w": vento km/h, "h": umidade %, "c": código WMO }
-- (modules/corrida/weather.js), buscado no Open-Meteo ao salvar uma corrida
-- com GPS; null sem GPS, sem internet ou em corridas antigas. Só a posição do
-- começo do percurso, arredondada a 0,1° e sem identificador, vai ao serviço.
-- Privado como o resto da linha (política "own all" de public.runs) e apagado
-- junto com a conta (cascade). O app funciona antes desta migration: sem a
-- coluna, a corrida salva sem o clima.

alter table public.runs
  add column if not exists weather jsonb;

alter table public.runs drop constraint if exists runs_weather_shape;
alter table public.runs add constraint runs_weather_shape
  check (weather is null or (jsonb_typeof(weather) = 'object' and octet_length(weather::text) <= 200));
