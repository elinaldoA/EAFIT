import { t } from '../../lib/i18n';
import { MAX_ACCURACY_M } from './geoTrack';

// Texto curto do estado do GPS (useGeoTracker) para a corrida ao vivo e para
// o aviso da aba Gravar. A precisão aparece já enquanto procura, para a pessoa
// ver que o sinal está chegando e melhorando.
const TEXT = {
  searching: acc => (acc == null
    ? t('📡 Procurando GPS…')
    : t('📡 Procurando GPS… sinal ±{v1} m (bom a partir de {v2} m)', { v1: acc, v2: MAX_ACCURACY_M })),
  slow: () => t('📡 O GPS está demorando: vá para um lugar aberto, longe de prédios e árvores'),
  approx: acc => t('📡 Localização aproximada (±{v1} m): ative a localização precisa do celular para este site', { v1: acc ?? '–' }),
  tracking: acc => t('📡 GPS ok (±{v1} m)', { v1: acc ?? '–' }),
  weak: () => t('📡 Sinal de GPS fraco — a distância pode atrasar'),
  denied: () => t('📡 Localização negada — libere nas configurações do navegador ou digite a distância no fim'),
  insecure: () => t('📡 GPS indisponível neste endereço — digite a distância no fim'),
  unsupported: () => t('📡 Este aparelho não tem GPS no navegador — digite a distância no fim'),
  error: () => t('📡 Não foi possível ler a localização: confira se ela está ligada no celular'),
};

export const gpsStatusText = (status, accuracy) => TEXT[status]?.(accuracy) || '';
