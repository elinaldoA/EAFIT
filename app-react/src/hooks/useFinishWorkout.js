import { useToast } from '../context/useToast';
import { useWorkout } from '../context/useWorkout';
import { formatDuration } from '../lib/utils';
import { playWorkoutFinishedSound } from '../lib/sound';
import { postActivity } from '../lib/friends';
import { coachSay, coachRecords, takeRecords, speechTime } from '../lib/coach';
import { gatherExerciseDetails, countSets } from '../lib/workoutSets';
import { buildWorkoutSummary } from '../lib/workoutSummary';
import { t } from '../lib/i18n';

// Quanto o toast "Treino finalizado" fica na tela (ToastContext) antes de a mensagem do envio entrar.
const FINISH_TOAST_MS = 2700;

// Fluxo de encerrar o treino do dia: confirmação, cronômetro, gravações, falas
// do treinador, feed dos amigos, aviso de envio e abertura do resumo.
export function useFinishWorkout({ day, user, timer, checked, markDone, bump, onFinish, activePlanDays }) {
  const { saveWorkoutTimer, syncAfterFinish } = useWorkout();
  const toast = useToast();

  function buildSummary(durationMs) {
    return buildWorkoutSummary({ day, durationMs, user, activePlanDays });
  }


  // Treino finalizado: depois que as gravações do fim assentam (as que falharam
  // entram na fila), tenta subir tudo que estiver pendente e conta o resultado —
  // só se havia pendência. O aviso espera o "Treino finalizado" ser lido.
  async function sendAfterFinish(saves) {
    await Promise.allSettled(saves);
    const outcome = await syncAfterFinish();
    if (!outcome) return;
    setTimeout(() => toast(outcome.remaining > 0
      ? t('📴 Treino salvo no aparelho — envia quando a conexão voltar')
      : t('✅ Treino enviado')), FINISH_TOAST_MS);
  }

  // Finalizar com séries por fazer pede confirmação: o botão fica embaixo do
  // polegar, e encerrar sem querer para o cronômetro, marca o dia e avisa os
  // amigos ("Refazer treino" zeraria o tempo).
  function confirmFinish() {
    const { done, total } = countSets(gatherExerciseDetails(day));
    const left = total - done;
    if (left <= 0) return true;
    return window.confirm(left === 1
      ? t('Ainda falta 1 série. Finalizar o treino mesmo assim?')
      : t('Ainda faltam {n} séries. Finalizar o treino mesmo assim?', { n: left }));
  }

  function handleFinishClick() {
    if (confirmFinish()) handleFinishWorkout();
  }

  function handleFinishWorkout() {
    const result = timer.finish();
    if (!result) return;
    const { accumulatedMs, startedAt, finishedAt } = result;
    playWorkoutFinishedSound();
    toast(t('🏁 Treino finalizado em {v1}!', { v1: formatDuration(accumulatedMs) }));
    const saves = [];
    if (!checked) saves.push(markDone(true));
    if (user) saves.push(saveWorkoutTimer(day.dia, { startedAt, finishedAt, durationSeconds: Math.round(accumulatedMs / 1000) }));
    if (user) sendAfterFinish(saves);
    bump();
    const summary = buildSummary(accumulatedMs);
    coachSay('finish', { feitos: summary.weekDone, meta: summary.weekTotal }, { delayMs: 900 });
    // Depois do fecho, o treinador comenta os números do treino, os recordes e a semana.
    const minutes = Math.round(accumulatedMs / 60000);
    if (summary.totalSetsDone > 0 && minutes > 0) {
      coachSay('finishStats', { series: summary.totalSetsDone, duracao: speechTime(minutes * 60) }, { delayMs: 950, queue: true });
    }
    coachRecords(takeRecords(day.dia), { delayMs: 975, queue: true });
    if (summary.weekTotal > 1 && summary.weekDone === summary.weekTotal) {
      coachSay('weekGoal', {}, { delayMs: 1000, queue: true });
    }
    if (user && summary.totalSetsDone > 0) {
      postActivity('treino', t('Concluiu o treino de {foco}', { foco: day.foco }), t('{v1} · {totalSetsDone} séries', { v1: formatDuration(accumulatedMs), totalSetsDone: summary.totalSetsDone }));
    }
    onFinish(summary);
  }

  function handleShowSummary() {
    onFinish(buildSummary(timer.elapsedMs));
  }

  return { confirmFinish, handleFinishClick, handleFinishWorkout, handleShowSummary };
}
