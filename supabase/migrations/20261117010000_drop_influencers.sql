-- Remove a funcionalidade de influenciadores (20261116010000_influencers).
-- Desfaz tabelas, colunas e RPCs na ordem inversa; tudo idempotente.

-- RPCs do admin
drop function if exists public.admin_review_influencer_program(uuid, boolean, text);
drop function if exists public.admin_influencer_programs(text);
drop function if exists public.admin_set_influencer(uuid, boolean);

-- RPCs do influenciador
drop function if exists public.influencer_delete_program(uuid);
drop function if exists public.influencer_set_program_hidden(uuid, boolean);
drop function if exists public.influencer_submit_program(uuid);
drop function if exists public.influencer_save_program(uuid, jsonb);
drop function if exists public.influencer_save_profile(text, text, text);
drop function if exists public.my_influencer();

-- RPCs do seguidor
drop function if exists public.my_followed_influencers();
drop function if exists public.my_active_program();
drop function if exists public.adopt_influencer_program(uuid, date);
drop function if exists public.influencer_follow(text, boolean);

-- RPCs públicas e auxiliares
drop function if exists public.influencers_directory();
drop function if exists public.influencer_program(uuid);
drop function if exists public.influencer_profile(text);
drop function if exists public.influencer_program_card(public.influencer_programs);
drop function if exists public.influencer_card(public.ambassadors);
drop function if exists public.influencer_program_error(jsonb);
drop function if exists public.my_influencer_id();

-- Tabelas e colunas (planos adotados continuam como planos comuns do aluno)
drop index if exists public.workout_plans_program_idx;
alter table public.workout_plans drop column if exists program_id;

drop table if exists public.influencer_follows;
drop table if exists public.influencer_programs;

alter table public.ambassadors drop constraint if exists ambassadors_influencer_profile_check;
alter table public.ambassadors
  drop column if exists is_influencer,
  drop column if exists bio,
  drop column if exists instagram,
  drop column if exists accent;
