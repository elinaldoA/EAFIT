-- Marketing: Reels na publicação automática. A fila ganha o formato 'reel'
-- (vídeo vertical feito dos prints do app, ver app-admin/scripts/marketing-reels.mjs).
-- Um Reel é um post de feed com um vídeo: Instagram publica como Reel, Facebook
-- como vídeo e Threads como vídeo.
--
--   reel   todo dia às 17h (BRT)  → Instagram, Facebook e Threads

alter table public.marketing_autopost_queue drop constraint if exists marketing_autopost_queue_format_check;
alter table public.marketing_autopost_queue add constraint marketing_autopost_queue_format_check
  check (format in ('feed', 'story', 'reel'));

insert into public.marketing_autopost_queue (position, key, format, caption, media) values
  (15, 'treino-reel', 'reel', 'Planilha, PDF, WhatsApp… dá para parar. 📲
Monte o treino no app e ele chega direto no celular do aluno.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-treino.mp4"}]'::jsonb),
  (16, 'evolucao-reel', 'reel', 'Aluno que não vê resultado, desiste. 💔
No app, cada carga e cada série viram evolução visível.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-evolucao.mp4"}]'::jsonb),
  (17, 'ao-vivo-reel', 'reel', 'Registrou, está no histórico. 💪
O treino ao vivo guarda carga e repetição de cada série.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-ao-vivo.mp4"}]'::jsonb),
  (18, 'nutricao-reel', 'reel', 'Resultado vem do treino e da comida. 🍽️
O aluno acompanha as duas coisas num só lugar.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-nutricao.mp4"}]'::jsonb);

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

  select * into v_item from public.marketing_autopost_queue
  where posted_at is null and format = p_format
  order by position
  limit 1
  for update skip locked;
  if not found then return null; end if;

  select array_agg(id) into v_accounts from public.marketing_accounts
  where status = 'ok' and platform in ('instagram', 'facebook', 'threads')
    and (p_format <> 'story' or platform <> 'threads');
  if coalesce(cardinality(v_accounts), 0) = 0 then return null; end if;

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

-- 17h de Brasília (UTC-3) = 20h UTC.
select cron.schedule('marketing-autopost-reel', '0 20 * * *', $$ select public.marketing_autopost_run('reel'); $$);
