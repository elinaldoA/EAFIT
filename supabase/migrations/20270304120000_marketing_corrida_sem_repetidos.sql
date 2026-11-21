-- Marketing do Run: não repetir mensagem que já foi ao ar. O autopost só barra mídia idêntica ou legenda
-- idêntica; estes dois feeds têm mídia e legenda novas mas repetem o que já foi publicado:
--   embreve-corrida-vem-ai-feed  = story e Reel "vem-ai" (19/11) e o carrossel "Já imaginou?" (20/11)
--   embreve-corrida-plano-feed   = story do 5K (20/11): o programa de corrida "chega em breve"
update public.marketing_autopost_queue
set skipped_at = now()
where key in ('embreve-corrida-vem-ai-feed', 'embreve-corrida-plano-feed')
  and posted_at is null
  and skipped_at is null;
