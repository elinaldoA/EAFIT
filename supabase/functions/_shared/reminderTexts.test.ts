import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  discomfortFollowupText, inactivityText, streakRiskText, waterText, weeklySummaryText, weightUpdateText,
} from './reminderTexts.ts';

Deno.test('português é o padrão e mantém os textos de sempre', () => {
  assertEquals(waterText('pt', 1500, 3500), { title: '💧 Hora de beber água', body: 'Você bebeu 1.5L de 3.5L hoje.' });
  assertEquals(streakRiskText('pt', 5).title, '🔥 Sua sequência está em risco!');
  assertEquals(inactivityText('pt', 4).body, 'Já fazem 4 dias sem treino. Que tal voltar hoje?');
  assertEquals(weeklySummaryText('pt', 3, 5, 1200).body, '3/5 treinos concluídos · 1200kg de volume total.');
  assertEquals(weightUpdateText('pt').title, '⚖️ Hora de atualizar seu peso');
});

Deno.test('inglês traduz título e corpo', () => {
  assertEquals(waterText('en', 1500, 3500).title, '💧 Time to drink water');
  assert(streakRiskText('en', 5).body.includes('5-day streak'));
  assert(inactivityText('en', 4).body.includes('4 days'));
  assertEquals(weeklySummaryText('en', 5, 5, 0).title, '🎉 Weekly goal hit!');
  assertEquals(weeklySummaryText('en', 2, 5, 0).title, '📊 Weekly summary');
  assert(weightUpdateText('en').body.includes('Profile'));
});

Deno.test('desconforto: severidade e exercício traduzidos em inglês', () => {
  const en = discomfortFollowupText('en', 'lesao', 'Supino Reto com Barra');
  assert(en.body.includes('(injury)'));
  assert(en.body.includes('Barbell Bench Press'));
  assert(discomfortFollowupText('en', 'forte', 'Exercício livre').body.includes('Exercício livre'));
  assert(discomfortFollowupText('pt', 'lesao', 'Supino Reto com Barra').body.includes('(lesão) em Supino Reto com Barra'));
});
