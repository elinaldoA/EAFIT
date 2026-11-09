import { useEffect, useState } from 'react';

// Paginação "ver mais" no cliente: só desenha `size` itens por vez, para listas
// longas de mídia/posts não pesarem a tela. Volta à primeira página quando
// `resetKey` muda (filtro, busca, ordem).
function usePaged(items, size = 24, resetKey = '') {
  const [shown, setShown] = useState(size);
  useEffect(() => { setShown(size); }, [resetKey, size]);
  return {
    visible: items.slice(0, shown),
    hasMore: items.length > shown,
    remaining: Math.max(0, items.length - shown),
    more: () => setShown(n => n + size),
  };
}

export default function ShowMore({ paged, label = 'Ver mais' }) {
  if (!paged.hasMore) return null;
  return (
    <div className="actions-row">
      <button type="button" className="btn btn--ghost btn--small" onClick={paged.more}>
        {label} ({paged.remaining} restante{paged.remaining === 1 ? '' : 's'})
      </button>
    </div>
  );
}

// Versão em componente (para usar onde um hook não cabe, como depois de um return antecipado).
export function Paged({ items, size = 24, resetKey = '', label, children }) {
  const paged = usePaged(items, size, resetKey);
  return (
    <>
      {children(paged.visible)}
      <ShowMore paged={paged} label={label} />
    </>
  );
}
