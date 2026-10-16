-- Contexto dos erros do app (lib/errorReporter.js): onde estourou (arquivo,
-- linha e coluna), o aparelho naquele momento (versão do app, sistema,
-- navegador, user-agent, instalado ou não, online, tela) e o rastro das
-- últimas ações antes do erro. Sem isso, erros sem stack — como o
-- "Script error." de extensões do navegador — não diziam nada.
--
-- Um objeto JSON de no máximo 8000 caracteres. O app manda e, se o banco
-- recusar, grava o erro sem o contexto (não perde o registro).

alter table public.client_errors
  add column if not exists context jsonb
  check (context is null or (jsonb_typeof(context) = 'object' and length(context::text) <= 8000));

grant insert (context) on public.client_errors to authenticated;
