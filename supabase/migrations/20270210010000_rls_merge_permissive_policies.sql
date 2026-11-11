-- Junta as políticas RLS permissivas sobrepostas (mesma tabela, mesmo comando,
-- mesmo papel): o Postgres avalia todas a cada consulta. Cada grupo vira uma
-- política só com as condições ligadas por OR, que é exatamente o efeito de
-- várias políticas permissivas juntas. Políticas "for all" foram separadas por
-- comando (select/insert/update/delete); sem "with check", vale o "using".
-- Onde os papéis eram diferentes (anon x authenticated) a política é dividida
-- por papel, e "public" passa a ser "anon, authenticated" (os papéis que o app
-- usa; service_role ignora RLS). Tudo numa transação: se algo falhar, nada muda.

-- achievements
drop policy "admin delete" on public.achievements;
drop policy "admin insert" on public.achievements;
drop policy "admin read" on public.achievements;
drop policy "admin update" on public.achievements;
drop policy "own achievements" on public.achievements;
create policy "achievements_select_m" on public.achievements as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "achievements_insert_m" on public.achievements as permissive for insert to public with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "achievements_update_m" on public.achievements as permissive for update to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id))) with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "achievements_delete_m" on public.achievements as permissive for delete to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));

-- admin_access
drop policy "read own or superadmin" on public.admin_access;
drop policy "superadmin writes admin_access" on public.admin_access;
create policy "admin_access_select_m" on public.admin_access as permissive for select to public using ((((admin_id = ( SELECT auth.uid() AS uid)) OR admin_can('admins'::text))) or (admin_can('admins'::text)));
create policy "admin_access_insert_m" on public.admin_access as permissive for insert to public with check (admin_can('admins'::text));
create policy "admin_access_update_m" on public.admin_access as permissive for update to public using (admin_can('admins'::text)) with check (admin_can('admins'::text));
create policy "admin_access_delete_m" on public.admin_access as permissive for delete to public using (admin_can('admins'::text));

-- app_settings
drop policy "admin delete" on public.app_settings;
drop policy "admin insert" on public.app_settings;
drop policy "admin read" on public.app_settings;
drop policy "admin update" on public.app_settings;
drop policy "public read" on public.app_settings;
create policy "app_settings_select_m" on public.app_settings as permissive for select to anon, authenticated using ((is_admin()) or (true));
create policy "app_settings_insert_m" on public.app_settings as permissive for insert to public with check (admin_can('settings'::text));
create policy "app_settings_update_m" on public.app_settings as permissive for update to public using (admin_can('settings'::text)) with check (admin_can('settings'::text));
create policy "app_settings_delete_m" on public.app_settings as permissive for delete to public using (admin_can('settings'::text));

-- body_measurements
drop policy "admin reads measurements" on public.body_measurements;
drop policy "own all" on public.body_measurements;
create policy "body_measurements_select_anon" on public.body_measurements as permissive for select to anon using (is_admin());
create policy "body_measurements_select_authenticated" on public.body_measurements as permissive for select to authenticated using ((is_admin()) or ((user_id = ( SELECT auth.uid() AS uid))));
create policy "body_measurements_insert_m" on public.body_measurements as permissive for insert to authenticated with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "body_measurements_update_m" on public.body_measurements as permissive for update to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "body_measurements_delete_m" on public.body_measurements as permissive for delete to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

-- campaign_costs
drop policy "admin reads campaign costs" on public.campaign_costs;
drop policy "admin writes campaign costs" on public.campaign_costs;
create policy "campaign_costs_select_m" on public.campaign_costs as permissive for select to public using ((is_admin()) or (admin_can('settings'::text)));
create policy "campaign_costs_insert_m" on public.campaign_costs as permissive for insert to public with check (admin_can('settings'::text));
create policy "campaign_costs_update_m" on public.campaign_costs as permissive for update to public using (admin_can('settings'::text)) with check (admin_can('settings'::text));
create policy "campaign_costs_delete_m" on public.campaign_costs as permissive for delete to public using (admin_can('settings'::text));

-- challenge_series
drop policy "admin reads challenge_series" on public.challenge_series;
drop policy "admin writes challenge_series" on public.challenge_series;
create policy "challenge_series_select_m" on public.challenge_series as permissive for select to public using ((is_admin()) or (admin_can('content'::text)));
create policy "challenge_series_insert_m" on public.challenge_series as permissive for insert to public with check (admin_can('content'::text));
create policy "challenge_series_update_m" on public.challenge_series as permissive for update to public using (admin_can('content'::text)) with check (admin_can('content'::text));
create policy "challenge_series_delete_m" on public.challenge_series as permissive for delete to public using (admin_can('content'::text));

-- commission_overrides
drop policy "admin reads commission_overrides" on public.commission_overrides;
drop policy "admin writes commission_overrides" on public.commission_overrides;
create policy "commission_overrides_select_m" on public.commission_overrides as permissive for select to public using ((is_admin()) or (admin_can('users'::text)));
create policy "commission_overrides_insert_m" on public.commission_overrides as permissive for insert to public with check (admin_can('users'::text));
create policy "commission_overrides_update_m" on public.commission_overrides as permissive for update to public using (admin_can('users'::text)) with check (admin_can('users'::text));
create policy "commission_overrides_delete_m" on public.commission_overrides as permissive for delete to public using (admin_can('users'::text));

-- commission_payouts
drop policy "admin reads commission_payouts" on public.commission_payouts;
drop policy "admin writes commission_payouts" on public.commission_payouts;
create policy "commission_payouts_select_m" on public.commission_payouts as permissive for select to public using ((is_admin()) or (admin_can('users'::text)));
create policy "commission_payouts_insert_m" on public.commission_payouts as permissive for insert to public with check (admin_can('users'::text));
create policy "commission_payouts_update_m" on public.commission_payouts as permissive for update to public using (admin_can('users'::text)) with check (admin_can('users'::text));
create policy "commission_payouts_delete_m" on public.commission_payouts as permissive for delete to public using (admin_can('users'::text));

-- commission_rules
drop policy "admin reads commission_rules" on public.commission_rules;
drop policy "admin writes commission_rules" on public.commission_rules;
create policy "commission_rules_select_m" on public.commission_rules as permissive for select to public using ((is_admin()) or (admin_can('users'::text)));
create policy "commission_rules_insert_m" on public.commission_rules as permissive for insert to public with check (admin_can('users'::text));
create policy "commission_rules_update_m" on public.commission_rules as permissive for update to public using (admin_can('users'::text)) with check (admin_can('users'::text));
create policy "commission_rules_delete_m" on public.commission_rules as permissive for delete to public using (admin_can('users'::text));

-- daily_checkins
drop policy "admin reads checkins" on public.daily_checkins;
drop policy "own all" on public.daily_checkins;
create policy "daily_checkins_select_anon" on public.daily_checkins as permissive for select to anon using (is_admin());
create policy "daily_checkins_select_authenticated" on public.daily_checkins as permissive for select to authenticated using ((is_admin()) or ((user_id = ( SELECT auth.uid() AS uid))));
create policy "daily_checkins_insert_m" on public.daily_checkins as permissive for insert to authenticated with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "daily_checkins_update_m" on public.daily_checkins as permissive for update to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "daily_checkins_delete_m" on public.daily_checkins as permissive for delete to authenticated using ((user_id = ( SELECT auth.uid() AS uid)));

-- exercise_discomfort
drop policy "admin delete" on public.exercise_discomfort;
drop policy "admin insert" on public.exercise_discomfort;
drop policy "admin read" on public.exercise_discomfort;
drop policy "admin update" on public.exercise_discomfort;
drop policy "own exercise_discomfort" on public.exercise_discomfort;
create policy "exercise_discomfort_select_m" on public.exercise_discomfort as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "exercise_discomfort_insert_m" on public.exercise_discomfort as permissive for insert to public with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "exercise_discomfort_update_m" on public.exercise_discomfort as permissive for update to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id))) with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "exercise_discomfort_delete_m" on public.exercise_discomfort as permissive for delete to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));

-- exercise_library
drop policy "admin delete" on public.exercise_library;
drop policy "admin insert" on public.exercise_library;
drop policy "admin read" on public.exercise_library;
drop policy "admin update" on public.exercise_library;
drop policy "anyone can read exercise_library" on public.exercise_library;
create policy "exercise_library_select_m" on public.exercise_library as permissive for select to public using ((is_admin()) or (true));
create policy "exercise_library_insert_m" on public.exercise_library as permissive for insert to public with check (admin_can('content'::text));
create policy "exercise_library_update_m" on public.exercise_library as permissive for update to public using (admin_can('content'::text)) with check (admin_can('content'::text));
create policy "exercise_library_delete_m" on public.exercise_library as permissive for delete to public using (admin_can('content'::text));

-- exercise_logs
drop policy "Usuários podem atualizar logs" on public.exercise_logs;
drop policy "Usuários podem deletar logs" on public.exercise_logs;
drop policy "Usuários podem inserir logs" on public.exercise_logs;
drop policy "Usuários podem ver seus logs" on public.exercise_logs;
drop policy "admin delete" on public.exercise_logs;
drop policy "admin insert" on public.exercise_logs;
drop policy "admin read" on public.exercise_logs;
drop policy "admin update" on public.exercise_logs;
create policy "exercise_logs_select_m" on public.exercise_logs as permissive for select to public using (((EXISTS ( SELECT 1
   FROM workouts
  WHERE ((workouts.id = exercise_logs.workout_id) AND (workouts.user_id = ( SELECT auth.uid() AS uid)))))) or (is_admin()));
create policy "exercise_logs_insert_m" on public.exercise_logs as permissive for insert to public with check (((EXISTS ( SELECT 1
   FROM workouts
  WHERE ((workouts.id = exercise_logs.workout_id) AND (workouts.user_id = ( SELECT auth.uid() AS uid)))))) or (admin_can('users'::text)));
create policy "exercise_logs_update_m" on public.exercise_logs as permissive for update to public using (((EXISTS ( SELECT 1
   FROM workouts
  WHERE ((workouts.id = exercise_logs.workout_id) AND (workouts.user_id = ( SELECT auth.uid() AS uid)))))) or (admin_can('users'::text))) with check (((EXISTS ( SELECT 1
   FROM workouts
  WHERE ((workouts.id = exercise_logs.workout_id) AND (workouts.user_id = ( SELECT auth.uid() AS uid)))))) or (admin_can('users'::text)));
create policy "exercise_logs_delete_m" on public.exercise_logs as permissive for delete to public using (((EXISTS ( SELECT 1
   FROM workouts
  WHERE ((workouts.id = exercise_logs.workout_id) AND (workouts.user_id = ( SELECT auth.uid() AS uid)))))) or (admin_can('users'::text)));

-- exercise_media
drop policy "admin delete" on public.exercise_media;
drop policy "admin insert" on public.exercise_media;
drop policy "admin read" on public.exercise_media;
drop policy "admin update" on public.exercise_media;
drop policy "anyone can read exercise_media" on public.exercise_media;
create policy "exercise_media_select_m" on public.exercise_media as permissive for select to public using ((is_admin()) or (true));
create policy "exercise_media_insert_m" on public.exercise_media as permissive for insert to public with check (admin_can('content'::text));
create policy "exercise_media_update_m" on public.exercise_media as permissive for update to public using (admin_can('content'::text)) with check (admin_can('content'::text));
create policy "exercise_media_delete_m" on public.exercise_media as permissive for delete to public using (admin_can('content'::text));

-- exercise_sets
drop policy "admin delete" on public.exercise_sets;
drop policy "admin insert" on public.exercise_sets;
drop policy "admin read" on public.exercise_sets;
drop policy "admin update" on public.exercise_sets;
drop policy "insert own sets" on public.exercise_sets;
drop policy "select own sets" on public.exercise_sets;
drop policy "update own sets" on public.exercise_sets;
create policy "exercise_sets_select_m" on public.exercise_sets as permissive for select to public using ((is_admin()) or ((EXISTS ( SELECT 1
   FROM workouts w
  WHERE ((w.id = exercise_sets.workout_id) AND (w.user_id = ( SELECT auth.uid() AS uid)))))));
create policy "exercise_sets_insert_m" on public.exercise_sets as permissive for insert to public with check ((admin_can('users'::text)) or ((EXISTS ( SELECT 1
   FROM workouts w
  WHERE ((w.id = exercise_sets.workout_id) AND (w.user_id = ( SELECT auth.uid() AS uid)))))));
create policy "exercise_sets_update_m" on public.exercise_sets as permissive for update to public using ((admin_can('users'::text)) or ((EXISTS ( SELECT 1
   FROM workouts w
  WHERE ((w.id = exercise_sets.workout_id) AND (w.user_id = ( SELECT auth.uid() AS uid))))))) with check ((admin_can('users'::text)) or ((EXISTS ( SELECT 1
   FROM workouts w
  WHERE ((w.id = exercise_sets.workout_id) AND (w.user_id = ( SELECT auth.uid() AS uid)))))));
create policy "exercise_sets_delete_m" on public.exercise_sets as permissive for delete to public using (admin_can('users'::text));

-- experiments
drop policy "admin reads experiments" on public.experiments;
drop policy "admin writes experiments" on public.experiments;
create policy "experiments_select_m" on public.experiments as permissive for select to public using ((is_admin()) or (admin_can('settings'::text)));
create policy "experiments_insert_m" on public.experiments as permissive for insert to public with check (admin_can('settings'::text));
create policy "experiments_update_m" on public.experiments as permissive for update to public using (admin_can('settings'::text)) with check (admin_can('settings'::text));
create policy "experiments_delete_m" on public.experiments as permissive for delete to public using (admin_can('settings'::text));

-- feedback
drop policy "admin delete" on public.feedback;
drop policy "admin read" on public.feedback;
drop policy "admin update" on public.feedback;
drop policy "own insert" on public.feedback;
drop policy "own read" on public.feedback;
create policy "feedback_select_m" on public.feedback as permissive for select to authenticated using ((is_admin()) or ((user_id = ( SELECT auth.uid() AS uid))));
create policy "feedback_insert_m" on public.feedback as permissive for insert to authenticated with check (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'novo'::text) AND (admin_note IS NULL) AND (admin_reply IS NULL) AND (( SELECT count(*) AS count
   FROM feedback f
  WHERE ((f.user_id = ( SELECT auth.uid() AS uid)) AND (f.created_at > (now() - '1 day'::interval)))) < 5)));
create policy "feedback_update_m" on public.feedback as permissive for update to authenticated using (is_admin()) with check (is_admin());
create policy "feedback_delete_m" on public.feedback as permissive for delete to authenticated using (is_admin());

-- landing_content
drop policy "admin delete" on public.landing_content;
drop policy "admin insert" on public.landing_content;
drop policy "admin read" on public.landing_content;
drop policy "admin update" on public.landing_content;
drop policy "anyone can read landing_content" on public.landing_content;
create policy "landing_content_select_m" on public.landing_content as permissive for select to public using ((is_admin()) or (true));
create policy "landing_content_insert_m" on public.landing_content as permissive for insert to public with check (admin_can('content'::text));
create policy "landing_content_update_m" on public.landing_content as permissive for update to public using (admin_can('content'::text)) with check (admin_can('content'::text));
create policy "landing_content_delete_m" on public.landing_content as permissive for delete to public using (admin_can('content'::text));

-- marketing_media
drop policy "admins read marketing_media" on public.marketing_media;
drop policy "marketing writes marketing_media" on public.marketing_media;
create policy "marketing_media_select_m" on public.marketing_media as permissive for select to public using ((is_admin()) or (admin_can('marketing'::text)));
create policy "marketing_media_insert_m" on public.marketing_media as permissive for insert to public with check (admin_can('marketing'::text));
create policy "marketing_media_update_m" on public.marketing_media as permissive for update to public using (admin_can('marketing'::text)) with check (admin_can('marketing'::text));
create policy "marketing_media_delete_m" on public.marketing_media as permissive for delete to public using (admin_can('marketing'::text));

-- nutrition_entries
drop policy "admin full access" on public.nutrition_entries;
drop policy "own nutrition_entries" on public.nutrition_entries;
create policy "nutrition_entries_select_m" on public.nutrition_entries as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "nutrition_entries_insert_m" on public.nutrition_entries as permissive for insert to public with check ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "nutrition_entries_update_m" on public.nutrition_entries as permissive for update to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id))) with check ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "nutrition_entries_delete_m" on public.nutrition_entries as permissive for delete to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));

-- nutrition_foods
drop policy "admin full access" on public.nutrition_foods;
drop policy "own nutrition_foods" on public.nutrition_foods;
create policy "nutrition_foods_select_m" on public.nutrition_foods as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "nutrition_foods_insert_m" on public.nutrition_foods as permissive for insert to public with check ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "nutrition_foods_update_m" on public.nutrition_foods as permissive for update to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id))) with check ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "nutrition_foods_delete_m" on public.nutrition_foods as permissive for delete to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));

-- nutrition_plans
drop policy "admin full access" on public.nutrition_plans;
drop policy "own nutrition_plans" on public.nutrition_plans;
create policy "nutrition_plans_select_m" on public.nutrition_plans as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "nutrition_plans_insert_m" on public.nutrition_plans as permissive for insert to public with check ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "nutrition_plans_update_m" on public.nutrition_plans as permissive for update to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id))) with check ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "nutrition_plans_delete_m" on public.nutrition_plans as permissive for delete to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));

-- partner_campaigns
drop policy "admin reads partner campaigns" on public.partner_campaigns;
drop policy "content admin writes partner campaigns" on public.partner_campaigns;
create policy "partner_campaigns_select_m" on public.partner_campaigns as permissive for select to public using ((is_admin()) or (admin_can('content'::text)));
create policy "partner_campaigns_insert_m" on public.partner_campaigns as permissive for insert to public with check (admin_can('content'::text));
create policy "partner_campaigns_update_m" on public.partner_campaigns as permissive for update to public using (admin_can('content'::text)) with check (admin_can('content'::text));
create policy "partner_campaigns_delete_m" on public.partner_campaigns as permissive for delete to public using (admin_can('content'::text));

-- plan_days
drop policy "admin delete" on public.plan_days;
drop policy "admin insert" on public.plan_days;
drop policy "admin read" on public.plan_days;
drop policy "admin update" on public.plan_days;
drop policy "own plan_days" on public.plan_days;
create policy "plan_days_select_m" on public.plan_days as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = ( SELECT workout_plans.user_id
   FROM workout_plans
  WHERE (workout_plans.id = plan_days.plan_id)))));
create policy "plan_days_insert_m" on public.plan_days as permissive for insert to public with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = ( SELECT workout_plans.user_id
   FROM workout_plans
  WHERE (workout_plans.id = plan_days.plan_id)))));
create policy "plan_days_update_m" on public.plan_days as permissive for update to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = ( SELECT workout_plans.user_id
   FROM workout_plans
  WHERE (workout_plans.id = plan_days.plan_id))))) with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = ( SELECT workout_plans.user_id
   FROM workout_plans
  WHERE (workout_plans.id = plan_days.plan_id)))));
create policy "plan_days_delete_m" on public.plan_days as permissive for delete to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = ( SELECT workout_plans.user_id
   FROM workout_plans
  WHERE (workout_plans.id = plan_days.plan_id)))));

-- plan_exercises
drop policy "admin delete" on public.plan_exercises;
drop policy "admin insert" on public.plan_exercises;
drop policy "admin read" on public.plan_exercises;
drop policy "admin update" on public.plan_exercises;
drop policy "own plan_exercises" on public.plan_exercises;
create policy "plan_exercises_select_m" on public.plan_exercises as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = ( SELECT wp.user_id
   FROM (workout_plans wp
     JOIN plan_days pd ON ((pd.plan_id = wp.id)))
  WHERE (pd.id = plan_exercises.plan_day_id)))));
create policy "plan_exercises_insert_m" on public.plan_exercises as permissive for insert to public with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = ( SELECT wp.user_id
   FROM (workout_plans wp
     JOIN plan_days pd ON ((pd.plan_id = wp.id)))
  WHERE (pd.id = plan_exercises.plan_day_id)))));
create policy "plan_exercises_update_m" on public.plan_exercises as permissive for update to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = ( SELECT wp.user_id
   FROM (workout_plans wp
     JOIN plan_days pd ON ((pd.plan_id = wp.id)))
  WHERE (pd.id = plan_exercises.plan_day_id))))) with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = ( SELECT wp.user_id
   FROM (workout_plans wp
     JOIN plan_days pd ON ((pd.plan_id = wp.id)))
  WHERE (pd.id = plan_exercises.plan_day_id)))));
create policy "plan_exercises_delete_m" on public.plan_exercises as permissive for delete to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = ( SELECT wp.user_id
   FROM (workout_plans wp
     JOIN plan_days pd ON ((pd.plan_id = wp.id)))
  WHERE (pd.id = plan_exercises.plan_day_id)))));

-- privacy_requests
drop policy "admin reads privacy requests" on public.privacy_requests;
drop policy "admin writes privacy requests" on public.privacy_requests;
create policy "privacy_requests_select_m" on public.privacy_requests as permissive for select to public using ((is_admin()) or (admin_can('users'::text)));
create policy "privacy_requests_insert_m" on public.privacy_requests as permissive for insert to public with check (admin_can('users'::text));
create policy "privacy_requests_update_m" on public.privacy_requests as permissive for update to public using (admin_can('users'::text)) with check (admin_can('users'::text));
create policy "privacy_requests_delete_m" on public.privacy_requests as permissive for delete to public using (admin_can('users'::text));

-- profiles
drop policy "Usuários podem atualizar seus próprios perfis" on public.profiles;
drop policy "Usuários podem inserir seus próprios perfis" on public.profiles;
drop policy "Usuários podem ver seus próprios perfis" on public.profiles;
drop policy "admin delete" on public.profiles;
drop policy "admin insert" on public.profiles;
drop policy "admin read" on public.profiles;
drop policy "admin update" on public.profiles;
create policy "profiles_select_m" on public.profiles as permissive for select to public using (((( SELECT auth.uid() AS uid) = id)) or (is_admin()));
create policy "profiles_insert_m" on public.profiles as permissive for insert to public with check (((( SELECT auth.uid() AS uid) = id)) or (admin_can('users'::text)));
create policy "profiles_update_m" on public.profiles as permissive for update to public using (((( SELECT auth.uid() AS uid) = id)) or (admin_can('users'::text))) with check (((( SELECT auth.uid() AS uid) = id)) or (admin_can('users'::text)));
create policy "profiles_delete_m" on public.profiles as permissive for delete to public using (admin_can('users'::text));

-- progress_photos
drop policy "admin delete" on public.progress_photos;
drop policy "admin insert" on public.progress_photos;
drop policy "admin read" on public.progress_photos;
drop policy "admin update" on public.progress_photos;
drop policy "own progress_photos" on public.progress_photos;
create policy "progress_photos_select_m" on public.progress_photos as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "progress_photos_insert_m" on public.progress_photos as permissive for insert to public with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "progress_photos_update_m" on public.progress_photos as permissive for update to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id))) with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "progress_photos_delete_m" on public.progress_photos as permissive for delete to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));

-- protein_logs
drop policy "admin full access" on public.protein_logs;
drop policy "own protein_logs" on public.protein_logs;
create policy "protein_logs_select_m" on public.protein_logs as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "protein_logs_insert_m" on public.protein_logs as permissive for insert to public with check ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "protein_logs_update_m" on public.protein_logs as permissive for update to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id))) with check ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "protein_logs_delete_m" on public.protein_logs as permissive for delete to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));

-- push_subscriptions
drop policy "admin delete" on public.push_subscriptions;
drop policy "admin insert" on public.push_subscriptions;
drop policy "admin read" on public.push_subscriptions;
drop policy "admin update" on public.push_subscriptions;
drop policy "push_subscriptions_own_rows" on public.push_subscriptions;
create policy "push_subscriptions_select_m" on public.push_subscriptions as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "push_subscriptions_insert_m" on public.push_subscriptions as permissive for insert to public with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "push_subscriptions_update_m" on public.push_subscriptions as permissive for update to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id))) with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "push_subscriptions_delete_m" on public.push_subscriptions as permissive for delete to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));

-- support_assignments
drop policy "admin reads support assignments" on public.support_assignments;
drop policy "admin writes support assignments" on public.support_assignments;
create policy "support_assignments_select_m" on public.support_assignments as permissive for select to public using ((is_admin()) or (admin_can('users'::text)));
create policy "support_assignments_insert_m" on public.support_assignments as permissive for insert to public with check (admin_can('users'::text));
create policy "support_assignments_update_m" on public.support_assignments as permissive for update to public using (admin_can('users'::text)) with check (admin_can('users'::text));
create policy "support_assignments_delete_m" on public.support_assignments as permissive for delete to public using (admin_can('users'::text));

-- surveys
drop policy "admin reads surveys" on public.surveys;
drop policy "admin writes surveys" on public.surveys;
create policy "surveys_select_m" on public.surveys as permissive for select to public using ((is_admin()) or (admin_can('content'::text)));
create policy "surveys_insert_m" on public.surveys as permissive for insert to public with check (admin_can('content'::text));
create policy "surveys_update_m" on public.surveys as permissive for update to public using (admin_can('content'::text)) with check (admin_can('content'::text));
create policy "surveys_delete_m" on public.surveys as permissive for delete to public using (admin_can('content'::text));

-- trainer_clients
drop policy "client sees own link" on public.trainer_clients;
drop policy "trainer sees own links" on public.trainer_clients;
create policy "trainer_clients_select_m" on public.trainer_clients as permissive for select to authenticated using (((client_id = ( SELECT auth.uid() AS uid))) or ((trainer_id = ( SELECT auth.uid() AS uid))));

-- trainers
drop policy "admin read trainers" on public.trainers;
drop policy "own trainer row" on public.trainers;
create policy "trainers_select_m" on public.trainers as permissive for select to authenticated using ((is_admin()) or ((user_id = ( SELECT auth.uid() AS uid))));

-- water_logs
drop policy "Usuários podem atualizar seus próprios water_logs" on public.water_logs;
drop policy "Usuários podem inserir seus próprios water_logs" on public.water_logs;
drop policy "Usuários podem ver seus próprios water_logs" on public.water_logs;
drop policy "admin delete" on public.water_logs;
drop policy "admin insert" on public.water_logs;
drop policy "admin read" on public.water_logs;
drop policy "admin update" on public.water_logs;
create policy "water_logs_select_m" on public.water_logs as permissive for select to public using (((( SELECT auth.uid() AS uid) = user_id)) or (is_admin()));
create policy "water_logs_insert_m" on public.water_logs as permissive for insert to public with check (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text)));
create policy "water_logs_update_m" on public.water_logs as permissive for update to public using (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text))) with check (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text)));
create policy "water_logs_delete_m" on public.water_logs as permissive for delete to public using (admin_can('users'::text));

-- weight_logs
drop policy "Usuários podem atualizar pesos" on public.weight_logs;
drop policy "Usuários podem inserir pesos" on public.weight_logs;
drop policy "Usuários podem ver seus pesos" on public.weight_logs;
drop policy "admin delete" on public.weight_logs;
drop policy "admin insert" on public.weight_logs;
drop policy "admin read" on public.weight_logs;
drop policy "admin update" on public.weight_logs;
create policy "weight_logs_select_m" on public.weight_logs as permissive for select to public using (((( SELECT auth.uid() AS uid) = user_id)) or (is_admin()));
create policy "weight_logs_insert_m" on public.weight_logs as permissive for insert to public with check (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text)));
create policy "weight_logs_update_m" on public.weight_logs as permissive for update to public using (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text))) with check (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text)));
create policy "weight_logs_delete_m" on public.weight_logs as permissive for delete to public using (admin_can('users'::text));

-- workout_plans
drop policy "admin delete" on public.workout_plans;
drop policy "admin insert" on public.workout_plans;
drop policy "admin read" on public.workout_plans;
drop policy "admin update" on public.workout_plans;
drop policy "own workout_plans" on public.workout_plans;
create policy "workout_plans_select_m" on public.workout_plans as permissive for select to public using ((is_admin()) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "workout_plans_insert_m" on public.workout_plans as permissive for insert to public with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "workout_plans_update_m" on public.workout_plans as permissive for update to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id))) with check ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));
create policy "workout_plans_delete_m" on public.workout_plans as permissive for delete to public using ((admin_can('users'::text)) or ((( SELECT auth.uid() AS uid) = user_id)));

-- workout_templates
drop policy "admin delete" on public.workout_templates;
drop policy "admin insert" on public.workout_templates;
drop policy "admin read" on public.workout_templates;
drop policy "admin update" on public.workout_templates;
drop policy "anyone can read workout_templates" on public.workout_templates;
create policy "workout_templates_select_m" on public.workout_templates as permissive for select to public using ((is_admin()) or (true));
create policy "workout_templates_insert_m" on public.workout_templates as permissive for insert to public with check (admin_can('content'::text));
create policy "workout_templates_update_m" on public.workout_templates as permissive for update to public using (admin_can('content'::text)) with check (admin_can('content'::text));
create policy "workout_templates_delete_m" on public.workout_templates as permissive for delete to public using (admin_can('content'::text));

-- workouts
drop policy "Usuários podem atualizar seus treinos" on public.workouts;
drop policy "Usuários podem deletar seus treinos" on public.workouts;
drop policy "Usuários podem inserir seus treinos" on public.workouts;
drop policy "Usuários podem ver seus próprios treinos" on public.workouts;
drop policy "admin delete" on public.workouts;
drop policy "admin insert" on public.workouts;
drop policy "admin read" on public.workouts;
drop policy "admin update" on public.workouts;
create policy "workouts_select_m" on public.workouts as permissive for select to public using (((( SELECT auth.uid() AS uid) = user_id)) or (is_admin()));
create policy "workouts_insert_m" on public.workouts as permissive for insert to public with check (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text)));
create policy "workouts_update_m" on public.workouts as permissive for update to public using (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text))) with check (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text)));
create policy "workouts_delete_m" on public.workouts as permissive for delete to public using (((( SELECT auth.uid() AS uid) = user_id)) or (admin_can('users'::text)));
