-- Marketing do Run: as legendas "Em breve" que ainda não saíram passam a trazer o endereço direto do
-- pré-cadastro (eafit.com.br/run/) em vez de "link na bio". A origem é "post" porque a mesma legenda
-- sai no Instagram e no Facebook; as bios seguem com ?origem=<rede>. Stories têm legenda vazia e
-- não mudam. Já publicadas e puladas ficam como estão.
update public.marketing_autopost_queue
set caption = replace(
  caption,
  'Entre na lista de espera: link na bio. 🏃',
  'Entre na lista de espera: eafit.com.br/run/?origem=post 🏃'
)
where hide_when_module = 'corrida'
  and posted_at is null
  and skipped_at is null
  and caption like '%Entre na lista de espera: link na bio. 🏃%';
