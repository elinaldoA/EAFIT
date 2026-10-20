import { useEffect, useState } from 'react';
import { fetchMyAmbassador } from '../lib/ambassador';
import { readCachedProgramKind, writeCachedProgramKind } from '../lib/appMode';
import { loadMyRef, saveMyRef } from '../lib/myRef';

// Descobre se o usuário logado está no programa de divulgação e com que nome
// ('embaixador' | 'influenciador' | null), para o botão e o modo do programa,
// e guarda o código dele para o card de treino (lib/myRef.js). Falha de rede
// mantém o último valor conhecido.
export function useProgram(userId) {
  const [kind, setKind] = useState(() => (userId ? readCachedProgramKind(userId) : null));

  useEffect(() => {
    loadMyRef(userId);
    if (!userId) return undefined;
    let active = true;
    fetchMyAmbassador(30)
      .then(amb => {
        if (!active) return;
        const k = amb?.kind || null;
        setKind(k);
        writeCachedProgramKind(userId, k);
        saveMyRef(userId, amb);
      })
      .catch(err => console.error('fetchMyAmbassador:', err));
    return () => { active = false; };
  }, [userId]);

  return kind;
}
