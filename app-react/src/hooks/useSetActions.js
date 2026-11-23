import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { allSetsDone } from '../lib/workoutSets';
import { t } from '../lib/i18n';

// Ações em lote sobre as séries de um exercício (marcar todas, repetir carga/reps,
// aplicar sugestão). markVersions muda a cada gravação vinda de fora, para os
// SetRow relerem o aparelho sem serem recriados.
export function useSetActions({ day, bump }) {
  const { user } = useAuth();
  const { saveSetState } = useWorkout();
  const toast = useToast();
  const [markVersions, setMarkVersions] = useState({});

  async function toggleAllSets(ex, setCount) {
    const next = !allSetsDone(ex, setCount, day.dia);
    for (let n = 1; n <= setCount; n++) {
      localStorage.setItem(`set_${day.dia}_${ex.nome}_${n}_done`, next);
    }
    setMarkVersions(v => ({ ...v, [ex.nome]: (v[ex.nome] || 0) + 1 }));
    bump();
    toast(next ? t('✅ Todas as séries marcadas!') : t('Séries desmarcadas'));
    if (user) {
      await Promise.all(
        Array.from({ length: setCount }, (_, i) => i + 1)
          .map(n => saveSetState(day.dia, ex.nome, n, { completed: next }))
      );
    }
  }

  async function fillOtherSets(ex, setCount, carga, reps) {
    const cargaNum = parseFloat(carga);
    if (!Number.isFinite(cargaNum) || reps === '') return;

    const toFill = [];
    for (let n = 2; n <= setCount; n++) {
      const existingCarga = localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_carga`);
      const existingReps = localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_reps`);
      if (!existingCarga && !existingReps) toFill.push(n);
    }
    if (!toFill.length) return;

    toFill.forEach(n => {
      localStorage.setItem(`set_${day.dia}_${ex.nome}_${n}_carga`, carga);
      localStorage.setItem(`set_${day.dia}_${ex.nome}_${n}_reps`, reps);
    });
    setMarkVersions(v => ({ ...v, [ex.nome]: (v[ex.nome] || 0) + 1 }));
    bump();
    toast(t('✅ Carga e reps repetidas nas outras séries'));
    if (user) {
      await Promise.all(
        toFill.map(n => saveSetState(day.dia, ex.nome, n, { carga: cargaNum, reps: parseFloat(reps) }))
      );
    }
  }

  // Aplica a sugestão de progressão/deload direto na Série 1 (mesmo truque de
  // localStorage + bump de markVersions que fillOtherSets já usa pra forçar o
  // SetRow a reler o valor) e reaproveita fillOtherSets pra propagar às demais
  // séries vazias quando há um alvo de reps (não há no caso de deload).
  async function applySuggestion(ex, setCount, carga, reps) {
    localStorage.setItem(`set_${day.dia}_${ex.nome}_1_carga`, carga);
    if (reps != null) localStorage.setItem(`set_${day.dia}_${ex.nome}_1_reps`, reps);
    setMarkVersions(v => ({ ...v, [ex.nome]: (v[ex.nome] || 0) + 1 }));
    bump();
    toast(t('🎯 Sugestão aplicada na Série 1'));
    if (user) {
      const patch = { carga: parseFloat(carga) };
      if (reps != null) patch.reps = parseFloat(reps);
      try {
        await saveSetState(day.dia, ex.nome, 1, patch);
      } catch (err) {
        console.error('applySuggestion:', err);
      }
    }
    if (reps != null) await fillOtherSets(ex, setCount, carga, reps);
  }

  // Repete o último treino do exercício: cada série recebe a carga e as reps
  // da série de mesmo número da sessão anterior (séries a mais repetem a última).
  // Sobrescreve o que já estava digitado; séries já concluídas ficam como estão.
  async function repeatLast(ex, setCount, lastSets) {
    if (!lastSets?.length) return;
    const patches = [];
    for (let n = 1; n <= setCount; n++) {
      if (localStorage.getItem(`set_${day.dia}_${ex.nome}_${n}_done`) === 'true') continue;
      const src = lastSets[Math.min(n, lastSets.length) - 1];
      localStorage.setItem(`set_${day.dia}_${ex.nome}_${n}_carga`, String(src.carga));
      if (src.reps != null) localStorage.setItem(`set_${day.dia}_${ex.nome}_${n}_reps`, String(src.reps));
      patches.push([n, { carga: src.carga, ...(src.reps != null && { reps: src.reps }) }]);
    }
    if (!patches.length) return;
    setMarkVersions(v => ({ ...v, [ex.nome]: (v[ex.nome] || 0) + 1 }));
    bump();
    toast(t('↩︎ Cargas do último treino aplicadas'));
    if (user) {
      try {
        await Promise.all(patches.map(([n, patch]) => saveSetState(day.dia, ex.nome, n, patch)));
      } catch (err) {
        console.error('repeatLast:', err);
      }
    }
  }

  return { markVersions, toggleAllSets, fillOtherSets, applySuggestion, repeatLast };
}
