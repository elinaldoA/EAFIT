-- Acrescenta exercícios novos aos 6 templates-base (public.workout_templates)
-- usados por generatePlan/fetchBaseTemplate quando o ciclo de um usuário
-- vence sem sucessor configurado (ver applyPlanExpiry/autoGenerateNextCycle
-- em app-react/src/lib/workoutPlans.js) — dá mais variedade ao treino gerado
-- automaticamente, sem mudar a estrutura de dias/foco de cada objetivo.
--
-- Cada UPDATE usa jsonb_set duas vezes (uma por dia) pra anexar um exercício
-- novo ao final do array `exercicios` de um dia de treino de força já
-- existente — nunca nos dias de "Cardio Leve / Recuperação" ou "Descanso
-- Total", que são intencionalmente de item único. Os índices de dia (0 =
-- Segunda, 1 = Terça, ...) seguem a ordem gravada em
-- 20260717000000_admin_extras.sql / 20260717010000_diet_variants_and_resistencia.sql.
--
-- Não é idempotente por natureza (rodar duas vezes duplicaria os exercícios)
-- — igual a toda migration de dado (não de schema) neste repo, roda uma vez
-- e fica registrada em supabase_migrations.schema_migrations.

-- massa: Segunda (Peito/Ombro/Tríceps) e Quarta (Pernas/Quadríceps)
update public.workout_templates
set days = jsonb_set(
  jsonb_set(
    days, '{0,exercicios}',
    (days #> '{0,exercicios}') || '[{"nome":"Crucifixo Máquina","series":"3","reps":"12-15","descanso":"45s","tecnica":"Foco no encurtamento, pico de contração"}]'::jsonb
  ),
  '{2,exercicios}',
  (days #> '{2,exercicios}') || '[{"nome":"Cadeira Adutora","series":"3","reps":"15-20","descanso":"45s","tecnica":"Carga moderada, foco adutores"}]'::jsonb
)
where meta = 'massa';

-- forca: Segunda (Peito/Tríceps) e Quinta (Ombro/Força)
update public.workout_templates
set days = jsonb_set(
  jsonb_set(
    days, '{0,exercicios}',
    (days #> '{0,exercicios}') || '[{"nome":"Supino Fechado com Barra","series":"4","reps":"5-6","descanso":"2min","tecnica":"Pegada fechada, foco tríceps"}]'::jsonb
  ),
  '{3,exercicios}',
  (days #> '{3,exercicios}') || '[{"nome":"Encolhimento com Barra","series":"4","reps":"8-10","descanso":"90s","tecnica":"Foco trapézio, sem rolar os ombros"}]'::jsonb
)
where meta = 'forca';

-- emagrecer: Segunda (Superiores) e Sexta (Superiores)
update public.workout_templates
set days = jsonb_set(
  jsonb_set(
    days, '{0,exercicios}',
    (days #> '{0,exercicios}') || '[{"nome":"Remada Baixa na Polia","series":"3","reps":"15-20","descanso":"30s","tecnica":"Circuito, ritmo constante"}]'::jsonb
  ),
  '{4,exercicios}',
  (days #> '{4,exercicios}') || '[{"nome":"Crucifixo Reto com Halteres","series":"3","reps":"15-20","descanso":"30s","tecnica":"Circuito, amplitude total"}]'::jsonb
)
where meta = 'emagrecer';

-- definicao: Terça (Costas/Bíceps) e Quinta (Posterior/Glúteos)
update public.workout_templates
set days = jsonb_set(
  jsonb_set(
    days, '{1,exercicios}',
    (days #> '{1,exercicios}') || '[{"nome":"Rosca Concentrada com Halter","series":"3","reps":"12-15","descanso":"45s","tecnica":"Cotovelo apoiado, pico de contração"}]'::jsonb
  ),
  '{3,exercicios}',
  (days #> '{3,exercicios}') || '[{"nome":"Glúteo na Polia (Coice)","series":"3","reps":"15 cada","descanso":"45s","tecnica":"Contração de pico, sem impulso"}]'::jsonb
)
where meta = 'definicao';

-- saude: Terça (Pernas/Quadríceps) e Quinta (Posterior/Glúteos)
update public.workout_templates
set days = jsonb_set(
  jsonb_set(
    days, '{1,exercicios}',
    (days #> '{1,exercicios}') || '[{"nome":"Cadeira Extensora","series":"3","reps":"12-15","descanso":"45s","tecnica":"Pausa 1s no topo"}]'::jsonb
  ),
  '{3,exercicios}',
  (days #> '{3,exercicios}') || '[{"nome":"Panturrilha Sentado","series":"3","reps":"15-20","descanso":"45s","tecnica":"Amplitude completa, foco sóleo"}]'::jsonb
)
where meta = 'saude';

-- resistencia: Terça (Força/Estabilidade) ganha exercício, Quinta (Cross-training) ganha item de pós-treino
update public.workout_templates
set days = jsonb_set(
  jsonb_set(
    days, '{1,exercicios}',
    (days #> '{1,exercicios}') || '[{"nome":"Elevação Pélvica","series":"3","reps":"15-20","descanso":"45s","tecnica":"Ativação de glúteo pra propulsão de corrida"}]'::jsonb
  ),
  '{3,pos}',
  (days #> '{3,pos}') || '[{"nome":"🔷 Ponte Unilateral (Glúteo)","series":"3","reps":"12 cada","descanso":"30s","tecnica":"Estabilidade de quadril pra corrida"}]'::jsonb
)
where meta = 'resistencia';
