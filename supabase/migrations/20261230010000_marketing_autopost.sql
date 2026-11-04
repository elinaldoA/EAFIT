-- Marketing: publicação automática. Uma fila de conteúdo pronto (feito dos
-- prints do próprio app, artes em eafit.com.br/img/marketing) que o cron
-- publica sozinho em Instagram, Facebook e Threads, reaproveitando a fila de
-- envio do Marketing (marketing_posts / marketing_post_targets).
--
--   feed   todo dia às 12h (BRT)  → Instagram, Facebook e Threads
--   story  todo dia às 19h (BRT)  → Instagram e Facebook (Threads não tem story)
--
-- Cada execução publica o próximo item ainda não publicado do formato. Sem
-- conta conectada ou com a chave desligada, nada sai e a fila fica como está.
-- As artes são geradas por app-admin/scripts/marketing-autopost-content.mjs.

create table if not exists public.marketing_autopost_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.marketing_autopost_settings (id) values (true) on conflict do nothing;

create table if not exists public.marketing_autopost_queue (
  id uuid primary key default gen_random_uuid(),
  position int not null,
  key text not null unique,
  format text not null check (format in ('feed', 'story')),
  caption text not null default '' check (char_length(caption) <= 5000),
  media jsonb not null check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) between 1 and 10),
  post_id uuid references public.marketing_posts(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists marketing_autopost_queue_next_idx
  on public.marketing_autopost_queue (format, position) where posted_at is null;

alter table public.marketing_autopost_settings enable row level security;
alter table public.marketing_autopost_queue enable row level security;
revoke all on public.marketing_autopost_settings, public.marketing_autopost_queue from anon;
drop policy if exists "admins read marketing_autopost_settings" on public.marketing_autopost_settings;
create policy "admins read marketing_autopost_settings" on public.marketing_autopost_settings for select using (public.is_admin());
drop policy if exists "admins read marketing_autopost_queue" on public.marketing_autopost_queue;
create policy "admins read marketing_autopost_queue" on public.marketing_autopost_queue for select using (public.is_admin());

insert into public.marketing_autopost_queue (position, key, format, caption, media) values
  (1, 'treino-feed', 'feed', 'Planilha, PDF, WhatsApp… dá para parar. 📲
Monte o treino no app e ele chega direto no celular do aluno.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/treino-feed.jpg"}]'::jsonb),
  (2, 'treino-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/treino-story.jpg"}]'::jsonb),
  (3, 'evolucao-feed', 'feed', 'Aluno que não vê resultado, desiste. 💔
Mostre a evolução de cada carga e de cada série. O app faz isso sozinho.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/evolucao-feed.jpg"}]'::jsonb),
  (4, 'evolucao-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/evolucao-story.jpg"}]'::jsonb),
  (5, 'sinais-feed', 'feed', 'Perder aluno quase nunca é surpresa. Os sinais aparecem antes. 👀
Salve este post e confira com seus alunos hoje.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/sinais-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/sinais-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/sinais-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/sinais-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/sinais-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/sinais-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/sinais-7.jpg"}]'::jsonb),
  (6, 'ao-vivo-feed', 'feed', 'Cada série registrada vira evolução que dá para ver. 📈
Aluno que enxerga o progresso treina mais motivado.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/ao-vivo-feed.jpg"}]'::jsonb),
  (7, 'ao-vivo-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/ao-vivo-story.jpg"}]'::jsonb),
  (8, 'retencao-feed', 'feed', 'Reter aluno custa menos do que conquistar um novo. 💡
Salve este post e aplique ainda esta semana.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/retencao-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/retencao-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/retencao-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/retencao-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/retencao-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/retencao-6.jpg"}]'::jsonb),
  (9, 'historico-feed', 'feed', 'Chega de perguntar “quanto foi que você fez semana passada?”. 🧠
O histórico completo de cada treino fica no app.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/historico-feed.jpg"}]'::jsonb),
  (10, 'historico-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/historico-story.jpg"}]'::jsonb),
  (11, 'nutricao-feed', 'feed', 'Resultado vem do treino e da comida. 🍽️
No app, o aluno acompanha as duas coisas num só lugar.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/nutricao-feed.jpg"}]'::jsonb),
  (12, 'nutricao-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/nutricao-story.jpg"}]'::jsonb),
  (13, 'agua-feed', 'feed', 'Hidratação também é treino. 💧
O app lembra e registra a meta diária de água.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/agua-feed.jpg"}]'::jsonb),
  (14, 'agua-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/agua-story.jpg"}]'::jsonb);
-- (o seed acima já termina em ponto e vírgula)

-- Liga/desliga pelo painel (Marketing → Publicar).
create or replace function public.marketing_autopost_set_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_can('marketing') then raise exception 'not_authorized'; end if;
  update public.marketing_autopost_settings set enabled = coalesce(p_enabled, true), updated_at = now() where id;
  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'marketingAutopost', jsonb_build_object('enabled', coalesce(p_enabled, true)));
end;
$$;
revoke execute on function public.marketing_autopost_set_enabled(boolean) from public, anon;
grant execute on function public.marketing_autopost_set_enabled(boolean) to authenticated;

-- Publica o próximo item do formato. Só o cron (postgres) chama.
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
    and (p_format = 'feed' or platform <> 'threads');
  if coalesce(cardinality(v_accounts), 0) = 0 then return null; end if;

  insert into public.marketing_posts (caption, media, scheduled_at, created_by, format)
  values (v_item.caption, v_item.media, null, null, v_item.format)
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

-- 12h e 19h de Brasília (UTC-3) = 15h e 22h UTC.
select cron.schedule('marketing-autopost-feed', '0 15 * * *', $$ select public.marketing_autopost_run('feed'); $$);
select cron.schedule('marketing-autopost-story', '0 22 * * *', $$ select public.marketing_autopost_run('story'); $$);
