-- Landing: pergunta nova no FAQ sobre a agenda de aulas com o personal.
-- Acrescenta ao FAQ que já está no banco, sem mexer no resto e sem sobrescrever
-- edições do admin; não repete se já foi aplicada.

update public.landing_content
set content = jsonb_set(
      content,
      '{sections}',
      (
        select jsonb_agg(
                 case when s->>'id' = 'faq'
                      then jsonb_set(s, '{items}', coalesce(s->'items', '[]'::jsonb) || $new$[{"question": "Como funciona a agenda de aulas com o personal?", "answer": "O personal marca a aula com dia, horário e local, e você recebe um aviso para confirmar ou recusar pelo app. Depois de confirmada, você e o personal recebem um lembrete na véspera e outro pouco antes da aula."}]$new$::jsonb)
                      else s end
                 order by ord)
        from jsonb_array_elements(content->'sections') with ordinality as t(s, ord)
      )
    ),
    updated_at = now()
where id = 1
  and content::text not like '%agenda de aulas com o personal%'
  and exists (select 1 from jsonb_array_elements(content->'sections') e where e->>'id' = 'faq');
