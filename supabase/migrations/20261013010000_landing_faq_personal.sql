-- Landing: duas perguntas novas no FAQ sobre o modo Personal (uso pelo personal
-- e o que ele vê do aluno). Acrescenta ao FAQ que já está no banco, sem mexer
-- no resto e sem sobrescrever edições do admin; não repete se já foi aplicada.

update public.landing_content
set content = jsonb_set(
      content,
      '{sections}',
      (
        select jsonb_agg(
                 case when s->>'id' = 'faq'
                      then jsonb_set(s, '{items}', coalesce(s->'items', '[]'::jsonb) || $new$[{"question": "Sou personal trainer. Posso usar o EAFIT com meus alunos?", "answer": "Pode. O modo Personal é liberado pela equipe do EAFIT na sua conta. Você passa seu código de convite, o aluno digita no app e autoriza, e aí você acompanha treinos, peso e medidas, monta e envia treinos, manda recados e cria desafios para a turma."}, {"question": "O que o meu personal vê dos meus dados?", "answer": "Só depois que você digita o código dele e autoriza: treinos, peso, medidas, check-ins e desconfortos. Suas fotos de evolução ficam privadas, a menos que você ligue o compartilhamento à parte em Perfil → Meu personal. Você pode desligar ou encerrar o vínculo quando quiser."}]$new$::jsonb)
                      else s end
                 order by ord)
        from jsonb_array_elements(content->'sections') with ordinality as t(s, ord)
      )
    ),
    updated_at = now()
where id = 1
  and content::text not like '%Sou personal trainer%'
  and exists (select 1 from jsonb_array_elements(content->'sections') e where e->>'id' = 'faq');
