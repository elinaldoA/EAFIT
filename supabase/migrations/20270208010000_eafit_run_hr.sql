-- EAFIT Run: frequência cardíaca da corrida.
--
-- runs.hr: { "avg": bpm médio, "max": bpm máximo } lidos de uma cinta
-- Bluetooth (modules/corrida/heartRate.js) durante a corrida; null sem cinta
-- ou com poucas leituras. A leitura bruta não é guardada, só a média e a
-- máxima, e nada disso sai do aparelho para terceiros (o Bluetooth fala direto
-- com a cinta). Privado como o resto da linha (política "own all" de
-- public.runs) e apagado junto com a conta (cascade). O app funciona antes
-- desta migration: sem a coluna, a corrida salva sem a frequência cardíaca.

alter table public.runs
  add column if not exists hr jsonb;

alter table public.runs drop constraint if exists runs_hr_shape;
alter table public.runs add constraint runs_hr_shape
  check (hr is null or (jsonb_typeof(hr) = 'object' and octet_length(hr::text) <= 100));
