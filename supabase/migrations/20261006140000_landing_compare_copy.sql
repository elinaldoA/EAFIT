-- Comparação da landing: "Anota a carga no papel, quando anota" vira uma
-- referência a apps genéricos. Troca só esse texto dentro do conteúdo salvo,
-- então preserva qualquer outra edição feita pelo painel. Sem efeito se o texto
-- antigo não estiver mais lá (já editado ou já atualizado).

update public.landing_content
set content = replace(content::text, 'Anota a carga no papel, quando anota', 'Usa apps genéricos que não sabem o seu treino nem a sua carga')::jsonb,
    updated_at = now()
where id = 1
  and content::text like '%Anota a carga no papel, quando anota%';
