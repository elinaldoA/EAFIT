-- Landing: acrescenta ao conteúdo já salvo o que entrou no app depois de
-- 20261024010000 — treinador por voz e bloqueio com biometria como cartões em
-- "features" (ícones novos mic/lock: ICONS em public/landing/assets/site.js <->
-- ICON_OPTIONS no LandingEditor) e perguntas no FAQ sobre voz, biometria e link
-- de embaixador. Corrige também o cartão de demonstração, que ainda dizia
-- "200 exercícios" (hoje são 1000 na biblioteca, mais de 170 com demonstração).
-- O texto do cartão só é trocado se ainda for o do seed; os acréscimos não
-- sobrescrevem edições do admin e não se repetem se a migration rodar de novo.

update public.landing_content
set content = jsonb_set(
      content,
      '{sections}',
      (
        select jsonb_agg(
                 case
                   when s->>'id' = 'features' then
                     jsonb_set(s, '{items}',
                       (
                         select coalesce(jsonb_agg(
                                  case
                                    when i->>'description' = 'Vídeos curtos com câmera lenta e imagens do movimento para 200 exercícios.'
                                      then jsonb_set(i, '{description}', to_jsonb('Vídeos curtos com câmera lenta e imagens do movimento para mais de 170 exercícios.'::text))
                                    else i
                                  end
                                  order by io), '[]'::jsonb)
                         from jsonb_array_elements(coalesce(s->'items', '[]'::jsonb)) with ordinality as it(i, io)
                       )
                       || case when s::text like '%Treinador por voz%' then '[]'::jsonb else $f$[
                         {"icon": "mic", "title": "Treinador por voz", "description": "Ele apresenta os exercícios, conta o descanso, lembra a carga da última vez e comemora seus recordes. Você escolhe a voz, o jeito e o quanto ele fala."},
                         {"icon": "lock", "title": "Bloqueio com biometria", "description": "Peça digital, Face ID ou o bloqueio de tela do aparelho para abrir o app. A biometria nunca sai do seu celular."}
                       ]$f$::jsonb end)
                   when s->>'id' = 'faq' and s::text not like '%O treinador por voz funciona como?%' then
                     jsonb_set(s, '{items}', coalesce(s->'items', '[]'::jsonb) || $q$[
                       {"question": "O treinador por voz funciona como?", "answer": "Ligue em Perfil → Treinador por voz. Durante o modo treino ele apresenta cada exercício, conta o descanso, fala a carga da última vez e a sugestão de hoje e comemora seus recordes. Você escolhe a voz, o jeito de falar (animado, zoeira ou calmo) e o quanto ele fala: só o essencial, tudo ou à vontade, com dicas no descanso. Use fone ou aumente o volume de mídia."},
                       {"question": "Dá para travar o app com a digital?", "answer": "Dá. Em Perfil → Preferências, ligue “Pedir biometria para abrir o app”. Ao abrir o app, ou voltar depois de 5 minutos fora, ele pede a digital, o Face ID ou o bloqueio de tela do aparelho. A biometria é conferida pelo próprio aparelho e nunca chega ao EAFIT; se falhar, dá para desbloquear com a senha da conta."},
                       {"question": "Cheguei pelo link de um embaixador. O que ele vê?", "answer": "Só números: quantas visitas e quantos cadastros vieram do link dele e quantas dessas contas treinaram na semana. Seu nome, e-mail e treinos não aparecem para o embaixador."}
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
