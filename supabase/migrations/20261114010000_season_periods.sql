-- Tema de temporada vira agenda: a chave "season" de public.app_settings passa
-- de um tema só para uma lista de períodos, e o app (app-react/src/lib/season.js)
-- e o site (public/landing/assets/site.js) ligam o tema do período de hoje.
--   season : { enabled, periods: [{ theme, startsOn: 'YYYY-MM-DD', endsOn: 'YYYY-MM-DD' }] }
-- Temas: outubro_rosa, halloween, novembro_azul. O app e o site continuam
-- lendo o formato antigo ({ enabled, theme, startsOn, endsOn }).
-- Já entra com a agenda de 2026: Outubro Rosa até a véspera do Dia das Bruxas,
-- Dia das Bruxas como estava e Novembro Azul logo depois. Só converte a chave
-- se ela ainda estiver no formato antigo (não pisa numa agenda salva pelo
-- painel), mantendo o ligado/desligado que o admin deixou.

update public.app_settings
   set value = jsonb_build_object(
         'enabled', coalesce((value ->> 'enabled')::boolean, true),
         'periods', jsonb_build_array(
           jsonb_build_object('theme', 'outubro_rosa', 'startsOn', '2026-10-19', 'endsOn', '2026-10-23'),
           jsonb_build_object('theme', 'halloween', 'startsOn', '2026-10-24', 'endsOn', '2026-11-02'),
           jsonb_build_object('theme', 'novembro_azul', 'startsOn', '2026-11-03', 'endsOn', '2026-11-30')
         )),
       updated_at = now()
 where key = 'season'
   and not (value ? 'periods');

insert into public.app_settings (key, value) values
  ('season', '{"enabled": true, "periods": [
    {"theme": "outubro_rosa", "startsOn": "2026-10-19", "endsOn": "2026-10-23"},
    {"theme": "halloween", "startsOn": "2026-10-24", "endsOn": "2026-11-02"},
    {"theme": "novembro_azul", "startsOn": "2026-11-03", "endsOn": "2026-11-30"}
  ]}')
on conflict (key) do nothing;
