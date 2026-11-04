-- Marketing: a publicação automática não repete conteúdo.
--
--   1. Antes de publicar, a fila confere o que já existe em marketing_posts: o
--      item é pulado (skipped_at) se a mesma mídia já foi publicada ou se a
--      mesma legenda já saiu em outro post (feed e Reel). Pulado fica na fila
--      como "repetido", sem sair, e a execução segue para o próximo.
--   2. Os Reels de treino, evolução e nutrição tinham a mesma legenda do post
--      de feed correspondente: ganham legenda própria.
--   3. Entram 4 conteúdos novos (2 carrosséis e 2 Reels) para a fila não encolher.
--
-- Só enxerga o que foi publicado pelo painel. Posts feitos direto no app do
-- Instagram não passam por aqui.

alter table public.marketing_autopost_queue add column if not exists skipped_at timestamptz;
drop index if exists public.marketing_autopost_queue_next_idx;
create index marketing_autopost_queue_next_idx
  on public.marketing_autopost_queue (format, position) where posted_at is null and skipped_at is null;

update public.marketing_autopost_queue set caption = E'Treino montado em segundos e já no celular do aluno. ⏱️\nSem planilha, sem PDF, sem mandar arquivo no WhatsApp.\n\nLink na bio 👇\n\n#personaltrainer #treino #appdetreino #academia #musculacao'
  where key = 'treino-reel' and posted_at is null;
update public.marketing_autopost_queue set caption = E'Evolução que o aluno enxerga é motivação todo dia. 📈\nCada carga e cada série viram gráfico no app.\n\nLink na bio 👇\n\n#personaltrainer #treino #appdetreino #academia #musculacao'
  where key = 'evolucao-reel' and posted_at is null;
update public.marketing_autopost_queue set caption = E'Treino aqui, dieta ali e nada conversa entre si? 🍽️\nNo app, o aluno vê calorias e macros junto do treino.\n\nLink na bio 👇\n\n#personaltrainer #treino #appdetreino #academia #musculacao'
  where key = 'nutricao-reel' and posted_at is null;

insert into public.marketing_autopost_queue (position, key, format, caption, media) values
  (19, 'erros-feed', 'feed', 'Quase todo aluno que larga o treino passou por um destes quatro erros. ⚠️
Salve e revise a sua rotina com os alunos.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/erros-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-6.jpg"}]'::jsonb),
  (20, 'checklist-feed', 'feed', 'Treino bom começa antes do primeiro exercício. ✅
Salve este checklist para o próximo aluno novo.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/checklist-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/checklist-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/checklist-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/checklist-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/checklist-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/checklist-6.jpg"}]'::jsonb);
insert into public.marketing_autopost_queue (position, key, format, caption, media) values
  (21, 'historico-reel', 'reel', 'Esqueceu a carga do último treino? 🧠
No histórico do app, cada treino fica salvo com data, carga e repetições.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-historico.mp4"}]'::jsonb),
  (22, 'agua-reel', 'reel', 'Treinar desidratado rende menos. 💧
O app registra a meta diária de água do aluno.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-agua.mp4"}]'::jsonb);

-- Publica o próximo item do formato que ainda não foi publicado. Só o cron chama.
create or replace function public.marketing_autopost_run(p_format text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.marketing_autopost_queue;
  v_accounts uuid[];
  v_post uuid;
begin
  if not coalesce((select enabled from public.marketing_autopost_settings where id), false) then return null; end if;

  select array_agg(id) into v_accounts from public.marketing_accounts
  where status = 'ok' and platform in ('instagram', 'facebook', 'threads')
    and (p_format <> 'story' or platform <> 'threads');
  if coalesce(cardinality(v_accounts), 0) = 0 then return null; end if;

  loop
    select * into v_item from public.marketing_autopost_queue
    where posted_at is null and skipped_at is null and format = p_format
    order by position
    limit 1
    for update skip locked;
    if not found then return null; end if;

    -- Repetido: mesma mídia, ou mesma legenda (não vazia) de um post que não foi cancelado.
    if exists (
      select 1 from public.marketing_posts p
      where p.id is distinct from v_item.post_id
        and (
          p.media = v_item.media
          or (btrim(v_item.caption) <> '' and btrim(p.caption) = btrim(v_item.caption))
        )
        and not exists (
          select 1 from public.marketing_post_targets t
          where t.post_id = p.id
          having bool_and(t.status = 'canceled')
        )
    ) then
      update public.marketing_autopost_queue set skipped_at = now() where id = v_item.id;
      insert into public.admin_audit_log (admin_id, target_user_id, action, details)
      values (null, null, 'marketingAutopostSkip', jsonb_build_object('key', v_item.key, 'format', v_item.format, 'reason', 'repetido'));
      continue;
    end if;
    exit;
  end loop;

  -- Reel é post de feed com vídeo.
  insert into public.marketing_posts (caption, media, scheduled_at, created_by, format)
  values (v_item.caption, v_item.media, null, null, case when v_item.format = 'story' then 'story' else 'feed' end)
  returning id into v_post;

  insert into public.marketing_post_targets (post_id, account_id, run_after)
  select v_post, a, now() from unnest(v_accounts) a;

  update public.marketing_autopost_queue set post_id = v_post, posted_at = now() where id = v_item.id;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (null, null, 'marketingAutopost', jsonb_build_object('post', v_post, 'key', v_item.key, 'format', v_item.format, 'accounts', cardinality(v_accounts)));
  return v_post;
end;
$$;
revoke execute on function public.marketing_autopost_run(text) from public, anon, authenticated;
