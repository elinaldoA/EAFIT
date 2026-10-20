import { useEffect, useState } from 'react';
import { fetchMyAmbassador, isInfluencer } from '../lib/ambassador';
import { readCachedIsInfluencer, writeCachedIsInfluencer } from '../lib/appMode';
import { loadMyRef, saveMyRef } from '../lib/myRef';

// Descobre se o usuário logado é influenciador (ambassadors.kind), para o
// botão e o modo Influenciador, e guarda o código dele para o card de treino
// (lib/myRef.js). Falha de rede mantém o último valor conhecido.
export function useInfluencer(userId) {
  const [value, setValue] = useState(() => (userId ? readCachedIsInfluencer(userId) : false));

  useEffect(() => {
    loadMyRef(userId);
    if (!userId) return undefined;
    let active = true;
    fetchMyAmbassador(30)
      .then(amb => {
        if (!active) return;
        const v = isInfluencer(amb);
        setValue(v);
        writeCachedIsInfluencer(userId, v);
        saveMyRef(userId, v ? amb : null);
      })
      .catch(err => console.error('fetchMyAmbassador:', err));
    return () => { active = false; };
  }, [userId]);

  return value;
}
