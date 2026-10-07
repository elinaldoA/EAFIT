// Textos das notificações do send-reminders (água, sequência, inatividade,
// resumo semanal, peso e acompanhamento de desconforto), em pt e en.
// Separado do index pra ser testável sem rede/banco.
import { type Lang, trExercise } from './lang.ts';

type Text = { title: string; body: string };

export function waterText(lang: Lang, currentMl: number, goalMl: number): Text {
  const cur = (currentMl / 1000).toFixed(1);
  const goal = (goalMl / 1000).toFixed(1);
  return lang === 'en'
    ? { title: '💧 Time to drink water', body: `You've had ${cur}L of ${goal}L today.` }
    : { title: '💧 Hora de beber água', body: `Você bebeu ${cur}L de ${goal}L hoje.` };
}

export function streakRiskText(lang: Lang, streak: number): Text {
  return lang === 'en'
    ? { title: '🔥 Your streak is at risk!', body: `You're on a ${streak}-day streak. Train today before midnight so you don't lose it.` }
    : { title: '🔥 Sua sequência está em risco!', body: `Você está numa sequência de ${streak} dias. Treine hoje antes da meia-noite pra não perdê-la.` };
}

export function inactivityText(lang: Lang, gap: number): Text {
  return lang === 'en'
    ? { title: '💤 We miss you', body: `It's been ${gap} days since your last workout. How about getting back to it today?` }
    : { title: '💤 Sentimos sua falta', body: `Já fazem ${gap} dias sem treino. Que tal voltar hoje?` };
}

export function weeklySummaryText(lang: Lang, count: number, goal: number, volume: number): Text {
  const hit = count >= goal;
  return lang === 'en'
    ? { title: hit ? '🎉 Weekly goal hit!' : '📊 Weekly summary', body: `${count}/${goal} workouts completed · ${volume}kg total volume.` }
    : { title: hit ? '🎉 Meta semanal batida!' : '📊 Resumo da semana', body: `${count}/${goal} treinos concluídos · ${volume}kg de volume total.` };
}

export function weightUpdateText(lang: Lang): Text {
  return lang === 'en'
    ? { title: '⚖️ Time to update your weight', body: 'Log this week\'s weight in your Profile to track your progress.' }
    : { title: '⚖️ Hora de atualizar seu peso', body: 'Registre seu peso desta semana no Perfil pra acompanhar sua evolução.' };
}

export function discomfortFollowupText(lang: Lang, severity: string, exerciseName: string): Text {
  const lesao = severity === 'lesao';
  return lang === 'en'
    ? {
      title: '🩹 Still feeling that pain?',
      body: `You reported ${lesao ? 'discomfort (injury)' : 'strong discomfort'} in ${trExercise(lang, exerciseName)} a few days ago. Still feeling it?`,
    }
    : {
      title: '🩹 Ainda sente essa dor?',
      body: `Você relatou desconforto ${lesao ? '(lesão)' : 'forte'} em ${exerciseName} há alguns dias. Ainda sente?`,
    };
}
