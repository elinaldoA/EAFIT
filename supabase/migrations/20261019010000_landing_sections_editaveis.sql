-- Landing: registra no content as seções que antes só existiam fixas no HTML
-- (números, "para quem é", Personal, depoimentos, instalar), pra poderem ser
-- ocultadas/reordenadas e, no caso de "para quem é" e depoimentos, editadas
-- pelo painel. Idempotente: não repete seção que já existe e não mexe nas
-- edições do admin nas demais.
--
-- Os depoimentos abaixo são PROVISÓRIOS (fictícios): trocar por reais no
-- painel (Landing page → Depoimentos) antes de divulgar.

do $$
declare
  c jsonb;
  secs jsonb;
  new_sec record;
  pos int;
begin
  select content into c from public.landing_content where id = 1;
  if c is null then return; end if;
  secs := c->'sections';

  for new_sec in
    select * from (values
      ('highlights', '{"id":"stats","type":"stats","enabled":true}'::jsonb),
      ('compare', $a${"id":"audience","type":"audience","enabled":true,"title":"Pra quem o EAFIT foi feito","subtitle":"Do primeiro dia na academia ao treino com acompanhamento.","items":[
        {"icon":"user","title":"Quem está começando","description":"Plano pronto pelo seu nível, demonstração de cada exercício e dicas de técnica pra treinar com segurança."},
        {"icon":"chart","title":"Quem quer evoluir","description":"Carga da última vez à vista, recordes, heatmap e gráficos pra enxergar o progresso de verdade."},
        {"icon":"wifi-off","title":"Quem treina em qualquer lugar","description":"Funciona offline, sincroniza depois e tem modo pausa pra viagem ou semana corrida."},
        {"icon":"users","title":"Personal trainers","description":"Acompanhe alunos, monte e envie treinos, marque aulas com lembrete e crie desafios pra turma."}]}$a$::jsonb),
      ('steps', '{"id":"personal","type":"personal","enabled":true}'::jsonb),
      ('personal', $t${"id":"testimonials","type":"testimonials","enabled":true,"title":"Quem usa, recomenda","subtitle":"Veja o que o pessoal da academia está dizendo sobre o EAFIT.","items":[
        {"name":"Rafael","role":"Intermediário · 8 meses de treino","text":"Finalmente parei de anotar treino no bloco de notas. O app já monta tudo e eu só vou marcando as séries. Funciona até no subsolo da academia, sem sinal."},
        {"name":"Mariana","role":"Iniciante · 2 meses de treino","text":"Comecei do zero e tinha vergonha de perguntar como fazer os exercícios. A demonstração e as dicas de técnica me deram segurança pra treinar sozinha."},
        {"name":"Carlos","role":"Personal trainer","text":"Uso com meus alunos: monto o treino, acompanho peso e medidas e marco as aulas pelo app. Eles respondem rápido e ninguém mais esquece o horário."}]}$t$::jsonb),
      ('faq', '{"id":"install","type":"install","enabled":true,"title":"Instale em 2 toques","subtitle":"Sem loja de apps. O EAFIT abre em tela cheia, como qualquer aplicativo."}'::jsonb)
    ) as v(after_id, sec)
  loop
    if exists (select 1 from jsonb_array_elements(secs) e where e->>'id' = new_sec.sec->>'id') then
      continue;
    end if;
    select ord into pos
    from jsonb_array_elements(secs) with ordinality as t(e, ord)
    where e->>'id' = new_sec.after_id;
    -- sem a seção de referência (ex.: apagada), vai antes do CTA final
    if pos is null then
      select ord - 1 into pos
      from jsonb_array_elements(secs) with ordinality as t(e, ord)
      where e->>'id' = 'cta';
    end if;
    if pos is null then pos := jsonb_array_length(secs); end if;

    secs := (
      select coalesce(jsonb_agg(x.e order by x.o), '[]'::jsonb)
      from (
        select t.e, t.ord::numeric as o from jsonb_array_elements(secs) with ordinality as t(e, ord)
        union all
        select new_sec.sec, pos + 0.5
      ) x
    );
  end loop;

  update public.landing_content
  set content = jsonb_set(c, '{sections}', secs), updated_at = now()
  where id = 1;
end
$$;
