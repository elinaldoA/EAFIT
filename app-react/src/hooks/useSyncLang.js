import { useEffect } from 'react';
import { db } from '../lib/supabase';
import { lang } from '../lib/i18n';

// Grava o idioma do app em user_metadata.lang pra as Edge Functions mandarem
// push e avisos no mesmo idioma (o servidor não enxerga o localStorage).
// Só escreve quando muda; falha (offline) tenta de novo na próxima abertura.
export function useSyncLang(user) {
  const userId = user?.id;
  const saved = user?.user_metadata?.lang;
  useEffect(() => {
    if (!userId || saved === lang) return;
    db.auth.updateUser({ data: { lang } }).catch(() => { /* offline: tenta na próxima */ });
  }, [userId, saved]);
}
