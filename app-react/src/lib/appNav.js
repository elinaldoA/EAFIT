import { writeMode } from './appMode';
import { NAV_TARGETS } from './pushTarget';

// Navegação pedida de fora das abas: toque numa notificação push ou num aviso
// do sino. O destino vem de NAV_TARGETS (lib/pushTarget.js).
export const NAV_EVENT = 'eafit-nav';
const PROFILE_OPEN_KEY = 'perfil_open';

// Vai pra tela do destino: anota o que ela deve abrir (aba do Dashboard,
// cartão do Perfil), troca o modo se preciso e muda a aba pelo hash
// (hooks/useHashTab.js). O NAV_EVENT avisa o App: o modo é relido e, quando há
// aba/cartão a abrir, a página é remontada — sem isso, quem já está na aba de
// destino não veria o que foi pedido. Destino sem atalho não remonta nada
// (um treino em andamento na tela de Treino continua como estava).
// `replace`: na abertura do app, sem empilhar entrada no histórico.
export function goTo(target, { replace = false, win = window } = {}) {
  if (!target?.tab) return;
  try {
    if (target.dashTab) win.localStorage.setItem('dash_tab', target.dashTab);
    if (target.profileCard) win.sessionStorage.setItem(PROFILE_OPEN_KEY, target.profileCard);
  } catch { /* sem storage: abre a tela sem o atalho */ }
  if (target.mode) writeMode(target.mode);
  const hash = `#${target.tab}`;
  if (replace) win.history.replaceState(win.history.state, '', hash);
  else if (win.location.hash !== hash) win.location.hash = hash;
  win.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { remount: !!(target.dashTab || target.profileCard) } }));
}

// Lido uma vez só: o Perfil abre o cartão pedido e esquece.
export function takeProfileCardToOpen() {
  try {
    const card = sessionStorage.getItem(PROFILE_OPEN_KEY);
    if (card) sessionStorage.removeItem(PROFILE_OPEN_KEY);
    return card || '';
  } catch {
    return '';
  }
}

// Toque numa notificação: o service worker abre o app com ?push=<destino>
// (app fechado) ou manda uma mensagem (app já aberto). Chamar antes de
// capturePushOpen (lib/tracking.js), que tira o ?push= da URL.
export function capturePushTarget(win = typeof window === 'undefined' ? null : window) {
  if (!win) return;
  try {
    const key = new URL(win.location.href).searchParams.get('push');
    goTo(NAV_TARGETS[key], { replace: true, win });
    win.navigator?.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type === 'eafit-push-open') goTo(NAV_TARGETS[event.data.target], { win });
    });
  } catch { /* URL ou history indisponíveis */ }
}
