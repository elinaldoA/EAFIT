-- Marketing do Run: o endereço do pré-cadastro nas legendas passa a ser a página do módulo com o formulário
-- (eafit.com.br/corrida/?origem=<rede>#avise-me), em vez de eafit.com.br/run/. A legenda guarda origem=post e a
-- função de publicação (trackedCaption) troca pela rede que publica (instagram, facebook...).
-- Só legendas que ainda não saíram; publicadas e puladas ficam como estão.
update public.marketing_autopost_queue
set caption = replace(
  caption,
  'eafit.com.br/run/?origem=post',
  'eafit.com.br/corrida/?origem=post#avise-me'
)
where hide_when_module = 'corrida'
  and posted_at is null
  and skipped_at is null
  and caption like '%eafit.com.br/run/?origem=post%';
