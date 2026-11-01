-- Demonstração de exercício passa a ser só vídeo: o bucket deixa de aceitar
-- GIF e imagem (o painel já recusa no envio — app-admin/src/lib/exerciseMedia.js).
-- Arquivos 'imagem' já enviados continuam servidos até o admin trocar por vídeo;
-- por isso o check de exercise_media.media_type fica como está.
update storage.buckets
set allowed_mime_types = array['video/mp4', 'video/webm']
where id = 'exercise-media';
