import { useCallback, useEffect, useState } from 'react';
import { fetchMedia } from '../../lib/marketing';
import { fetchPromoMaterials } from '../../lib/promoMaterials';

// Mídias da biblioteca e, para cada uma, os públicos de parceiros que já a recebem.
// `onError` recebe o texto de erro quando a lista não carrega.
export function useMediaLibrary(onError) {
  const [items, setItems] = useState(null);
  // Material de parceiros que veio da biblioteca: id da mídia → públicos.
  const [shared, setShared] = useState(() => new Map());

  const load = useCallback(async () => {
    try {
      setItems(await fetchMedia());
    } catch (err) {
      onError(`Erro: ${err.message}`);
      setItems([]);
    }
    try {
      const map = new Map();
      for (const p of await fetchPromoMaterials()) {
        if (p.source_media_id) map.set(p.source_media_id, [...(map.get(p.source_media_id) || []), p.audience]);
      }
      setShared(map);
    } catch {
      setShared(new Map()); // sem acesso ao material de parceiros: só não marca
    }
  }, [onError]);

  useEffect(() => { load(); }, [load]);

  return { items, shared, load };
}
