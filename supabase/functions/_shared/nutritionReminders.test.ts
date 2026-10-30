import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  MEAL_REMINDERS, PROTEIN_GAP_TIME, isDiaryUser, mealText, shouldRemindMeal, nutritionSummaryText, proteinGap, proteinGapText, proteinGoal, summarizeWeek,
} from './nutritionReminders.ts';

const PERFIL = { sexo: 'M', idade: '30', peso: '80', altura: '180', meta: 'massa' };

Deno.test('meta de proteína igual à do app (g/kg por objetivo)', () => {
  assertEquals(proteinGoal(PERFIL), 160);
  assertEquals(proteinGoal({ ...PERFIL, meta: 'definicao' }), 176);
  assertEquals(proteinGoal({ ...PERFIL, meta: undefined }), 112); // sem objetivo vale saúde
});

Deno.test('sem perfil completo não há meta', () => {
  assertEquals(proteinGoal({}), null);
  assertEquals(proteinGoal({ ...PERFIL, sexo: undefined }), null);
  assertEquals(proteinGoal({ ...PERFIL, peso: '20' }), null);
});

Deno.test('um lembrete por refeição, do café ao jantar, sem horário repetido', () => {
  assertEquals(MEAL_REMINDERS.map((m) => m.meal), ['cafe', 'almoco', 'lanche', 'jantar', 'ceia']);
  assertEquals(MEAL_REMINDERS.map((m) => m.time), ['07:00', '12:00', '16:00', '20:00', '22:00']);
  const times = MEAL_REMINDERS.map((m) => m.time);
  assertEquals(new Set([...times, PROTEIN_GAP_TIME]).size, times.length + 1);
});

Deno.test('diário: só quem registrou em 3+ dos últimos 7 dias', () => {
  assertEquals(isDiaryUser(2), false);
  assertEquals(isDiaryUser(3), true);
});

Deno.test('refeição: café, almoço e jantar pra todo usuário do diário; lanche e ceia só com o hábito', () => {
  assertEquals(shouldRemindMeal('cafe', 5, 0, false), true);
  assertEquals(shouldRemindMeal('jantar', 5, 0, true), false); // já registrou hoje
  assertEquals(shouldRemindMeal('almoco', 2, 2, false), false); // não usa o diário
  assertEquals(shouldRemindMeal('ceia', 5, 1, false), false);
  assertEquals(shouldRemindMeal('ceia', 5, 2, false), true);
  assertEquals(shouldRemindMeal('lanche', 5, 0, false), false);
  assertEquals(shouldRemindMeal('lanche', 5, 3, false), true);
});

Deno.test('proteína: avisa só com registro hoje e diferença de 20g ou mais', () => {
  assertEquals(proteinGap(160, 100), 60);
  assertEquals(proteinGap(160, 145), null);
  assertEquals(proteinGap(160, 0), null);
  assertEquals(proteinGap(null, 50), null);
  assertEquals(proteinGap(160, 170), null);
});

Deno.test('resumo da semana ignora dias sem registro', () => {
  const day = (protein: number, kcal = 0) => ({ protein, kcal });
  assertEquals(summarizeWeek([day(0), day(0)], 160), null);
  assertEquals(summarizeWeek([day(100), day(0), day(170), day(160)], 160), { daysLogged: 3, avgProtein: 143, daysOnGoal: 2 });
  assertEquals(summarizeWeek([day(100)], null), { daysLogged: 1, avgProtein: 100, daysOnGoal: null });
  // dia só com calorias conta como registrado e entra na média com 0g
  assertEquals(summarizeWeek([day(120), day(0, 1800)], 160), { daysLogged: 2, avgProtein: 60, daysOnGoal: 0 });
});

Deno.test('textos em português e inglês', () => {
  assertEquals(mealText('pt', 'almoco').title, '🍽️ Como foi o almoço?');
  assertEquals(mealText('en', 'jantar').title, '🍽️ Did you log dinner?');
  assertEquals(mealText('pt', 'cafe').title, '☕ Já tomou café da manhã?');
  assertEquals(mealText('en', 'lanche').title, '🍎 What about your afternoon snack?');
  assertEquals(mealText('pt', 'ceia').title, '🌙 Hora da ceia');
  assertEquals(proteinGapText('pt', 60, 160).body, 'Faltam 60g pra meta de 160g. Dá pra encaixar no jantar.');
  assert(proteinGapText('en', 60, 160).body.includes('160g goal'));

  const w = { daysLogged: 5, avgProtein: 130, daysOnGoal: 1 };
  assertEquals(nutritionSummaryText('pt', w).body, 'Registrou 5/7 dias · média de 130g de proteína por dia · meta de proteína batida em 1 dia.');
  assert(nutritionSummaryText('en', w).body.includes('hit on 1 day.'));
  assertEquals(
    nutritionSummaryText('pt', { ...w, daysOnGoal: null }).body,
    'Registrou 5/7 dias · média de 130g de proteína por dia.',
  );
});
