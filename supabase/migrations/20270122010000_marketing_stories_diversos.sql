-- Stories mais variados: menos comida e água, mais telas do app.
--
-- Problema: 4 dos 5 stories do dia eram de nutrição (café 6h30, almoço 12h30, hidratação
-- 15h e jantar 19h30), todos com os mesmos 3 prints (nutricao, nutricao-diario e agua),
-- e só 1 era geral (17h30). As filas de almoço e jantar já estavam no fim (0 e 1 pendentes).
--
-- Agora:
--   06:30 (09:00 sáb e dom)  story café da manhã   nutrição (continua)
--   12:30                    story geral           (era almoço)
--   15:00                    story hidratação      nutrição (continua)
--   17:30                    story geral
--   19:30                    story geral           (era jantar)
-- Os 3 horários gerais saem da mesma fila (slot nulo), com a regra de tema de
-- marketing_autopost_run: tema que saiu nos últimos 3 dias fica para depois.
--
-- Conteúdo novo (vídeos de app-admin/scripts/marketing-stories.mjs, ONLY=novos):
--   * 3 stories de café com telas que ainda não apareciam (macros, corpo, gasto real);
--   * 18 stories gerais com roteiro novo (gancho em pergunta) sobre treino, evolução,
--     histórico, músculos, carga, constância, recordes, corpo, progressão, amigos, liga,
--     treinador por voz e nutrição, mais as telas do modo Personal que não tinham story
--     (alertas, recados para todos e ficha do aluno).
--   * 21 tutoriais narrados de 20 a 36 s (story-v3-*.mp4), feitos antes para Reels e TikTok
--     (pasta EAFIT Instagram/Videos): plano personalizado, treino no tempo, trocar exercício,
--     ver execução, metas de carga, retrospectiva, modo pausa, mobilidade, liga, desafios,
--     amigos e o modo Personal. Ficaram de fora hidratação (já repete demais), o treinador
--     por voz (79 s, acima do limite de 60 s do story) e o das Bruxas (valia até 02/11).
-- Os itens novos são intercalados com os que já estavam na fila geral.
--
-- Painel: AUTOPOST_LANES e SLOT_LABEL em app-admin/src/lib/marketing.js.

-- 1. Cron: almoço e jantar viram stories gerais (cron.unschedule não falha se o job não existe aqui).
do $$
begin
  perform cron.unschedule('marketing-autopost-story-almoco');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('marketing-autopost-story-jantar');
exception when others then null;
end $$;
select cron.schedule('marketing-autopost-story-12h30', '30 15 * * *', $$ select public.marketing_autopost_run('story'); $$);
select cron.schedule('marketing-autopost-story-19h30', '30 22 * * *', $$ select public.marketing_autopost_run('story'); $$);

-- 2. O que sobrou das filas de almoço e jantar vai para a fila geral.
update public.marketing_autopost_queue set slot = null
where format = 'story' and slot in ('almoco', 'jantar') and posted_at is null and skipped_at is null;

-- 3. Itens novos, no fim da fila.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, 'story', v.slot, '',
  jsonb_build_array(jsonb_build_object('type', 'video', 'url', 'https://eafit.com.br/img/marketing/' || v.file))
from (values
  (1, 'nutri-cafe-5', 'cafe', 'story-cafe-5.mp4'),
  (2, 'nutri-cafe-6', 'cafe', 'story-cafe-6.mp4'),
  (3, 'nutri-cafe-7', 'cafe', 'story-cafe-7.mp4'),
  (4, 'v2-treino-story', null, 'story-v2-treino.mp4'),
  (5, 'v2-ao-vivo-story', null, 'story-v2-ao-vivo.mp4'),
  (6, 'v2-evolucao-story', null, 'story-v2-evolucao.mp4'),
  (7, 'v2-historico-story', null, 'story-v2-historico.mp4'),
  (8, 'v2-musculos-story', null, 'story-v2-musculos.mp4'),
  (9, 'v2-carga-story', null, 'story-v2-carga.mp4'),
  (10, 'v2-consistencia-story', null, 'story-v2-consistencia.mp4'),
  (11, 'v2-recordes-story', null, 'story-v2-recordes.mp4'),
  (12, 'v2-corpo-story', null, 'story-v2-corpo.mp4'),
  (13, 'v2-progressao-story', null, 'story-v2-progressao.mp4'),
  (14, 'v2-amigos-story', null, 'story-v2-amigos.mp4'),
  (15, 'v2-liga-story', null, 'story-v2-liga.mp4'),
  (16, 'v2-treinador-voz-story', null, 'story-v2-treinador-voz.mp4'),
  (17, 'v2-nutricao-macros-story', null, 'story-v2-nutricao-macros.mp4'),
  (18, 'v2-nutricao-semana-story', null, 'story-v2-nutricao-semana.mp4'),
  (19, 'v2-personal-alertas-story', null, 'story-v2-personal-alertas.mp4'),
  (20, 'v2-personal-recados-story', null, 'story-v2-personal-recados.mp4'),
  (21, 'v2-personal-ficha-story', null, 'story-v2-personal-ficha.mp4'),
  (22, 'v3-criar-conta-story', null, 'story-v3-criar-conta.mp4'),
  (23, 'v3-plano-personalizado-story', null, 'story-v3-plano-personalizado.mp4'),
  (24, 'v3-treino-no-tempo-story', null, 'story-v3-treino-no-tempo.mp4'),
  (25, 'v3-academia-condominio-casa-story', null, 'story-v3-academia-condominio-casa.mp4'),
  (26, 'v3-ver-execucao-story', null, 'story-v3-ver-execucao.mp4'),
  (27, 'v3-trocar-exercicio-story', null, 'story-v3-trocar-exercicio.mp4'),
  (28, 'v3-modo-treino-ao-vivo-story', null, 'story-v3-modo-treino-ao-vivo.mp4'),
  (29, 'v3-metas-de-carga-story', null, 'story-v3-metas-de-carga.mp4'),
  (30, 'v3-volume-por-musculo-story', null, 'story-v3-volume-por-musculo.mp4'),
  (31, 'v3-retrospectiva-do-mes-story', null, 'story-v3-retrospectiva-do-mes.mp4'),
  (32, 'v3-peso-fotos-medidas-story', null, 'story-v3-peso-fotos-medidas.mp4'),
  (33, 'v3-modo-pausa-story', null, 'story-v3-modo-pausa.mp4'),
  (34, 'v3-mobilidade-guiada-story', null, 'story-v3-mobilidade-guiada.mp4'),
  (35, 'v3-liga-do-mes-story', null, 'story-v3-liga-do-mes.mp4'),
  (36, 'v3-desafios-com-amigos-story', null, 'story-v3-desafios-com-amigos.mp4'),
  (37, 'v3-amigos-e-ranking-story', null, 'story-v3-amigos-e-ranking.mp4'),
  (38, 'v3-personal-como-ter-acesso-story', null, 'story-v3-personal-como-ter-acesso.mp4'),
  (39, 'v3-personal-painel-e-ficha-story', null, 'story-v3-personal-painel-e-ficha.mp4'),
  (40, 'v3-personal-montar-treino-e-modelos-story', null, 'story-v3-personal-montar-treino-e-modelos.mp4'),
  (41, 'v3-personal-agenda-e-turma-story', null, 'story-v3-personal-agenda-e-turma.mp4'),
  (42, 'v3-influenciador-embaixador-story', null, 'story-v3-influenciador-embaixador.mp4')
) as v(n, key, slot, file)
on conflict (key) do nothing;

-- 4. Intercala os novos com os antigos na fila geral: um antigo, um novo, um antigo...
with g as (
  select id, key ~ '^v[0-9]+-' as is_new,
    row_number() over (partition by (key ~ '^v[0-9]+-') order by position) as rn
  from public.marketing_autopost_queue
  where format = 'story' and slot is null and posted_at is null and skipped_at is null
), ranked as (
  select id, row_number() over (order by rn, is_new) as n from g
)
update public.marketing_autopost_queue q
set position = (select max(position) from public.marketing_autopost_queue) + r.n
from ranked r
where q.id = r.id;
