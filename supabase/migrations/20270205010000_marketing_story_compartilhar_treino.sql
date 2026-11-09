-- Tutorial "como compartilhar seu treino" (story-v3-compartilhar-treino.mp4, 29,5 s, 9:16):
-- terminar o treino, Resumo, Compartilhar treino / com foto, postar marcando @eafitapp.
-- Entra na frente da fila geral de stories: sai no proximo horario geral (19:30 de hoje).
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select coalesce(min(position), 1) - 1, 'v3-compartilhar-treino-story', 'story', null, '',
  jsonb_build_array(jsonb_build_object('type', 'video', 'url', 'https://eafit.com.br/img/marketing/story-v3-compartilhar-treino.mp4'))
from public.marketing_autopost_queue
where format = 'story' and slot is null and posted_at is null and skipped_at is null
on conflict (key) do nothing;
