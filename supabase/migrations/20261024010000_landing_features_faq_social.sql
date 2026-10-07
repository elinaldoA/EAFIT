-- Landing: acrescenta ao conteúdo já salvo os recursos novos do app (cardio,
-- amigos e ranking semanal, avisos, idioma pt/en) como cartões em "features" e
-- perguntas no FAQ. Só acrescenta (não sobrescreve edições do admin) e não
-- repete se já foi aplicada.

update public.landing_content
set content = jsonb_set(
      content,
      '{sections}',
      (
        select jsonb_agg(
                 case
                   when s->>'id' = 'features' and s::text not like '%Amigos e ranking semanal%'
                     then jsonb_set(s, '{items}', coalesce(s->'items', '[]'::jsonb) || $f$[
                       {"icon": "activity", "title": "Cardio com cronômetro", "description": "Esteira, corrida ou bike no plano: cronometre, anote a distância e veja o ritmo médio em min/km."},
                       {"icon": "users", "title": "Amigos e ranking semanal", "description": "Adicione amigos pelo código, veja o ranking de dias treinados na semana e reaja aos treinos e recordes no feed."},
                       {"icon": "bell", "title": "Avisos e lembretes", "description": "Central de avisos no sino, lembretes de treino e de água e notificações que você liga e desliga quando quiser."},
                       {"icon": "globe", "title": "Português e inglês", "description": "Troque o idioma do app no Perfil ou na tela de acesso. Um tutorial guiado mostra o caminho e pode ser revisto quando quiser."}
                     ]$f$::jsonb)
                   when s->>'id' = 'faq' and s::text not like '%Como adiciono amigos e vejo o ranking%'
                     then jsonb_set(s, '{items}', coalesce(s->'items', '[]'::jsonb) || $q$[
                       {"question": "Como adiciono amigos e vejo o ranking?", "answer": "Cada pessoa tem um código de amigo no app. Você digita o código do amigo, ele aceita o pedido e vocês passam a se ver no ranking semanal de dias treinados e no feed de treinos, recordes e sequências, onde dá pra reagir com 💪 🔥 👏. Só aparecem apelido e atividade, e você pode desligar o compartilhamento quando quiser."},
                       {"question": "Dá para registrar cardio?", "answer": "Dá. Itens como esteira, corrida e bike não têm séries: você usa o cronômetro (ou digita a duração), informa a distância se quiser e o app calcula o ritmo médio em min/km."},
                       {"question": "O app tem versão em inglês?", "answer": "Tem. Troque entre português e inglês no Perfil ou na tela de acesso. No primeiro uso, um tutorial guiado mostra os principais recursos e pode ser revisto no Perfil."}
                     ]$q$::jsonb)
                   else s
                 end
                 order by ord)
        from jsonb_array_elements(content->'sections') with ordinality as t(s, ord)
      )
    ),
    updated_at = now()
where id = 1
  and exists (select 1 from jsonb_array_elements(content->'sections') e where e->>'id' in ('features', 'faq'));
