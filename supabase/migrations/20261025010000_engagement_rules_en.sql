-- Notificações automáticas em inglês: cada regra de engagement_rules ganha
-- title_en/body_en. send-engagement usa a versão em inglês para quem escolheu
-- English no app (user_metadata.lang = 'en') e cai no texto em português
-- quando a regra não tem tradução (regras novas criadas no painel admin).
-- O painel edita o texto em português; o inglês fica como semeado aqui.
alter table public.engagement_rules
  add column if not exists title_en text,
  add column if not exists body_en text;

update public.engagement_rules as r
set title_en = v.title_en, body_en = v.body_en
from (values
  ('plan_expiring', '📅 Your plan ends {quando}',
   '{nome}, make the most of the last workouts of the cycle and check your progress.'),
  ('first_workout', '🚀 Your first workout is waiting',
   '{nome}, your plan is ready. Start today — it only takes a few minutes!'),
  ('weekly_goal', '🎯 {faltam} workout(s) left to reach your goal',
   'You did {feitos} of {meta} this week. There is still time to close it out!'),
  ('workout_today', '💪 Today is {foco} day',
   '{nome}, your workout is waiting. Let''s go?'),
  ('comeback', '👋 Your progress is waiting for you',
   '{nome}, it has been {dias} days since your last workout. Get back to it today with an easy session.'),
  ('no_plan', '🏋️ Shall we build your first workout?',
   '{nome}, you don''t have a plan yet. Build yours in the app (or ask your trainer) and start today!'),
  ('first_workout_late', '⏳ Your first workout is still waiting for you',
   '{nome}, it doesn''t have to be perfect: a short workout counts and starts your streak. Open the app and take the first step!'),
  ('second_workout', '🔥 Ready to go for the second workout?',
   '{nome}, your first workout was {dias} days ago. Training again now is what makes a streak stick!'),
  ('invite_friends', '👥 Training with friends is easier',
   '{nome}, add a friend with their code and follow the weekly ranking and workout feed together.')
) as v(kind, title_en, body_en)
where r.kind = v.kind and r.title_en is null and r.body_en is null;
