-- Tema de temporada: chave "season" em public.app_settings (leitura pública,
-- escrita só admin — ver 20261006040000_app_settings.sql). O app
-- (app-react/src/lib/season.js) e o site (public/landing/assets/site.js) só
-- mostram a decoração entre startsOn e endsOn, no fuso America/Sao_Paulo.
--   season : { enabled, theme: 'halloween', startsOn: 'YYYY-MM-DD', endsOn: 'YYYY-MM-DD' }
-- Já entra agendado para a semana do Dia das Bruxas de 2026; o painel admin
-- (Configurações do app → Tema de temporada) liga, desliga e muda as datas.
-- Não sobrescreve se o admin já tiver salvo a chave.

insert into public.app_settings (key, value) values
  ('season', '{"enabled": true, "theme": "halloween", "startsOn": "2026-10-24", "endsOn": "2026-11-02"}')
on conflict (key) do nothing;
