import { INVITE_URL } from './links';
import { trackFeature } from './tracking';

import { t } from './i18n';
// Convite avulso (botão em Perfil): leva pra landing com ?origem=convite, pra
// aparecer separado na contagem de visitas (lib/pageVisits.js).
export const INVITE_TEXT = t('Tô usando o EAFIT pra montar e registrar meus treinos. É grátis e funciona offline — bora treinar junto? 💪');

// 'shared' (abriu o compartilhar do sistema), 'copied' (sem compartilhar
// nativo: link na área de transferência), 'cancelled' (fechou o menu) ou
// 'failed' (nem compartilhar nem copiar funcionou).
export async function shareInvite() {
  trackFeature('invite');
  if (navigator.share) {
    try {
      await navigator.share({ title: 'EAFIT', text: INVITE_TEXT, url: INVITE_URL });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Outros erros (ex.: bloqueado no navegador): tenta copiar.
    }
  }
  try {
    await navigator.clipboard.writeText(`${INVITE_TEXT} ${INVITE_URL}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
