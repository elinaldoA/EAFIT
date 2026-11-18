-- Marketing: itens da fila que dependem do módulo Corrida estar ligado no painel.
--
-- Problema: o módulo Corrida só é liberado ao público quando o admin liga a chave
-- (Configurações do app > Módulos = app_settings "modules".enabled com "corrida"). O material de
-- lançamento não pode sair antes disso, e o de pré-lançamento ("Em breve") deve parar quando o
-- módulo ligar.
--
-- Agora a fila tem duas colunas opcionais:
--   requires_module   o item só é elegível com esse módulo ligado (lançamento da corrida);
--   hide_when_module  o item deixa de ser elegível quando esse módulo liga (itens "Em breve").
-- marketing_autopost_run respeita as duas. Sem mexer em nada na hora de ligar a chave: os itens de
-- lançamento começam a sair nos próximos disparos e os "Em breve" que sobraram ficam parados.
-- Os itens de lançamento entram na frente da fila pendente (posição abaixo da menor pendente).

alter table public.marketing_autopost_queue
  add column if not exists requires_module text,
  add column if not exists hide_when_module text;

create or replace function public.marketing_module_on(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select value->'enabled' @> to_jsonb(p_module) from public.app_settings where key = 'modules'), false)
$fn$;

create or replace function public.marketing_autopost_run(p_format text, p_slot text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item public.marketing_autopost_queue;
  v_accounts uuid[];
  v_post uuid;
  v_season text := public.marketing_active_season();
begin
  if not coalesce((select enabled from public.marketing_autopost_settings where id), false) then return null; end if;

  select array_agg(id) into v_accounts from public.marketing_accounts
  where status = 'ok' and platform in ('instagram', 'facebook');
  if coalesce(cardinality(v_accounts), 0) = 0 then return null; end if;

  loop
    -- Item da temporada no ar primeiro; item de outra temporada espera. Item que depende de um
    -- módulo só sai com o módulo ligado; item "Em breve" some quando o módulo liga.
    select * into v_item from public.marketing_autopost_queue
    where posted_at is null and skipped_at is null and format = p_format and slot is not distinct from p_slot
      and (season is null or season = v_season)
      and (requires_module is null or public.marketing_module_on(requires_module))
      and (hide_when_module is null or not public.marketing_module_on(hide_when_module))
    -- Tema que saiu em qualquer formato nos últimos 3 dias vai para o fim da vez
    -- (feed "treino" ontem não vira story "treino" hoje); só sai se não houver outro.
    order by exists (
        select 1 from public.marketing_autopost_queue q
        where q.posted_at > now() - interval '3 days'
          and public.marketing_autopost_theme(q.key) = public.marketing_autopost_theme(marketing_autopost_queue.key)
      ),
      (season is not null) desc, position
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
  values (null, null, 'marketingAutopost', jsonb_build_object(
    'post', v_post, 'key', v_item.key, 'format', v_item.format, 'slot', v_item.slot, 'season', v_item.season, 'accounts', cardinality(v_accounts)
  ));
  return v_post;
end;
$function$;

-- Itens "Em breve" (já na fila): param de sair quando o módulo Corrida ligar.
update public.marketing_autopost_queue set hide_when_module = 'corrida' where key like 'embreve-corrida-%';

-- Itens de lançamento: só saem com o módulo Corrida ligado.
insert into public.marketing_autopost_queue (position, key, format, caption, media, requires_module)
select (select coalesce(min(position), 1) from public.marketing_autopost_queue where posted_at is null and skipped_at is null) - 12 + v.n, v.key, v.format, v.caption, v.media::jsonb, 'corrida'
from (values
  (1, 'corrida-inicio-feed', 'feed', 'Chegou o EAFIT Run. 🏃
Grave a corrida com GPS, veja o mapa, o ritmo e o tempo e receba aplausos de quem corre com você.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-inicio-feed.jpg"}]'),
  (2, 'corrida-lancamento-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-corrida-lancamento.mp4"}]'),
  (3, 'corrida-lancamento-reel', 'reel', 'Corrida, mapa e amigos no mesmo app. 🏃
O EAFIT Run grava o seu percurso e mostra o ritmo de cada quilômetro.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-corrida-lancamento.mp4"}]'),
  (4, 'corrida-motivos-feed', 'feed', 'Cinco motivos para gravar a sua próxima corrida no EAFIT Run. 🏃
Salve este post e mande para o seu parceiro de corrida.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-motivos-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-motivos-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-motivos-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-motivos-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-motivos-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-motivos-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-motivos-7.jpg"}]'),
  (5, 'corrida-ao-vivo-feed', 'feed', 'Corrida gravada enquanto você corre. 📍
O app mostra tempo, distância, ritmo e o tempo de cada quilômetro, e pode avisar por voz a cada km.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-ao-vivo-feed.jpg"}]'),
  (6, 'corrida-ao-vivo-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-corrida-ao-vivo.mp4"}]'),
  (7, 'corrida-5k-reel', 'reel', 'Primeiros 5 km sem improviso. 👟
Escolha o objetivo e o seu nível e o app monta as semanas, com corrida, descanso e força para corredor.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-corrida-5k.mp4"}]'),
  (8, 'corrida-5k-feed', 'feed', 'Começar a correr não precisa ser difícil. 👟
Salve estes passos e comece do seu jeito. No EAFIT Run, o programa de 5K diz qual corrida fazer em cada dia.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-5k-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-5k-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-5k-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-5k-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-5k-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-5k-6.jpg"}]'),
  (9, 'corrida-desafios-feed', 'feed', 'Todo mês um desafio novo. 🏅
Corra os km do mês, feche as corridas da semana e dispute o ranking de km com os amigos.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-desafios-feed.jpg"}]'),
  (10, 'corrida-desafios-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-corrida-desafios.mp4"}]'),
  (11, 'corrida-amigos-reel', 'reel', 'Com amigo junto, fica mais difícil faltar. 👊
Adicione os amigos pelo código, veja as corridas deles e dispute os km da semana.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-corrida-amigos.mp4"}]')
) as v(n, key, format, caption, media);
