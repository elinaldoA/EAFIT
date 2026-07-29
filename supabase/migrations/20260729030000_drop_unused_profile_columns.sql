-- profiles.weight/height/training_time nunca foram lidos pelo app (o corpo
-- do perfil vive em auth.users.user_metadata desde a baseline — ver
-- comentário no topo de 20260701000000_baseline_schema.sql). profiles hoje
-- só é usado por lib/avatar.js (avatar_data) e pelo painel admin (is_admin).

alter table public.profiles
  drop column if exists weight,
  drop column if exists height,
  drop column if exists training_time;
