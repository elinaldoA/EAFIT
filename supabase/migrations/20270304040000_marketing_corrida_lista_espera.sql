-- Marketing do Run: as peças "Em breve" que ainda não saíram passam a convidar para a lista de espera
-- (pré-cadastro em eafit.com.br/run/, link na bio de cada rede com ?origem=<rede>).
-- Troca só o rodapé das legendas; imagens, vídeos, ordem e a regra "some quando o módulo liga"
-- (hide_when_module = 'corrida') ficam como estão. Nada diz que o módulo já abriu.
update public.marketing_autopost_queue
set caption = replace(
  caption,
  'Fique de olho: em breve no EAFIT. 👀',
  'Quer ser avisado quando abrir? Entre na lista de espera: link na bio. 🏃'
)
where hide_when_module = 'corrida'
  and posted_at is null
  and skipped_at is null
  and caption like '%Fique de olho: em breve no EAFIT. 👀%';
