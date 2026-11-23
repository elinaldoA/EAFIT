import { useEffect, useRef, useState } from 'react';

// Notas do treino do dia: guarda no aparelho na hora e no servidor depois de
// 800 ms de pausa (ou ao sair do campo / fechar a aba).
export function useWorkoutNotes({ day, user, saveWorkoutNotes }) {
  const [notes, setNotes] = useState(() => localStorage.getItem(`treino_${day.dia}_notes`) || '');
  const notesSaveTimer = useRef(null);

  async function flushNotes(val) {
    if (!user) return;
    try {
      await saveWorkoutNotes(day.dia, val);
    } catch (err) {
      console.error('saveWorkoutNotes:', err);
    }
  }

  function handleNotesInput(e) {
    const val = e.target.value;
    setNotes(val);
    localStorage.setItem(`treino_${day.dia}_notes`, val);
    clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => flushNotes(val), 800);
  }

  function handleNotesBlur() {
    clearTimeout(notesSaveTimer.current);
    flushNotes(notes);
  }

  // Mesma proteção contra F5/fechar aba que SetRow já usa: dispara o save
  // pendente na hora em vez de esperar o debounce de 800ms.
  useEffect(() => {
    function flushPendingNotes() {
      if (notesSaveTimer.current) {
        clearTimeout(notesSaveTimer.current);
        flushNotes(notes);
      }
    }
    window.addEventListener('pagehide', flushPendingNotes);
    window.addEventListener('beforeunload', flushPendingNotes);
    return () => {
      window.removeEventListener('pagehide', flushPendingNotes);
      window.removeEventListener('beforeunload', flushPendingNotes);
    };
  });

  return { notes, handleNotesInput, handleNotesBlur };
}
