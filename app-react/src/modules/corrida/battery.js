import { t } from '../../lib/i18n';

// Bateria durante a corrida: avisa quando está acabando para a pessoa poupar
// (tela escura, voz) ou deixar o celular carregando. Só vale onde o navegador
// expõe a bateria (Chrome no Android); no iPhone e no Firefox não há aviso.

// O navegador deixa ler a bateria? Não no iPhone (Safari) nem no Firefox.
export const batteryReadable = () => typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function';

// Onde não dá para ler a bateria, um lembrete a cada 45 min de corrida (tempo em movimento).
export const NUDGE_EVERY_S = 45 * 60;

// Quantos lembretes já "venceram" com `elapsedS` de corrida: 0 até 45 min, 1 até 90 min…
export const nudgeBlock = elapsedS => Math.floor(Math.max(0, elapsedS) / NUDGE_EVERY_S);

export const nudgeMessage = () => t('⏱️ Corrida longa: se a bateria estiver baixa, use a tela escura.');
export const nudgeSpoken = () => t('Corrida longa. Se a bateria estiver baixa, use a tela escura.');

export const LOW_PCT = 20;
export const CRITICAL_PCT = 10;

// 'ok' | 'low' | 'critical'. Carregando nunca avisa.
export function batteryState(level, charging) {
  if (charging || !Number.isFinite(level)) return 'ok';
  if (level <= CRITICAL_PCT) return 'critical';
  if (level <= LOW_PCT) return 'low';
  return 'ok';
}

export function batteryMessage(state, level) {
  if (state === 'critical') return t('🪫 Bateria em {v1}%: finalize logo ou ligue o carregador, senão a corrida pode se perder.', { v1: level });
  if (state === 'low') return t('🔋 Bateria em {v1}%: use a tela escura e deixe o celular poupar energia.', { v1: level });
  return '';
}

export function batterySpoken(state, level) {
  return state === 'critical'
    ? t('Bateria em {v1} por cento. Finalize logo a corrida.', { v1: level })
    : t('Bateria em {v1} por cento.', { v1: level });
}
