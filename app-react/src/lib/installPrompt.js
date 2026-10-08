import { t } from './i18n';

// Instalação do app (PWA) pra quem ainda abre o EAFIT numa aba do navegador —
// alimenta a tela components/InstallScreen.jsx.
//
// Chrome, Edge e Samsung avisam que dá pra instalar pelo evento
// `beforeinstallprompt`, que dispara cedo (antes de o React montar) e uma vez
// só: captureInstallPrompt() é chamado em main.jsx pra guardar o evento. Safari
// e Firefox não têm esse evento — neles só resta explicar o caminho pelo menu.

const SKIP_KEY = 'eafit_install_skipped';

let deferred = null;
let installed = false;
const listeners = new Set();

function notify() { listeners.forEach(fn => fn()); }

export function captureInstallPrompt(win = typeof window === 'undefined' ? null : window) {
  if (!win) return;
  win.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferred = event;
    notify();
  });
  win.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function subscribeInstall(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 'installed' (acabou de instalar, mas segue na aba), 'prompt' (o navegador
// deixa instalar com um toque) ou 'manual' (só pelo menu do navegador).
export function getInstallState() {
  if (installed) return 'installed';
  return deferred ? 'prompt' : 'manual';
}

// O evento só pode ser usado uma vez: recusou, sobra o caminho manual.
export async function promptInstall() {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  try {
    event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'dismissed';
  } finally {
    notify();
  }
}

// Passo a passo pelo menu do navegador. `null` = navegador sem instalação
// (ex.: Firefox no computador) — ali a tela não aparece, pra não cobrar o
// impossível. No iPhone/iPad todo navegador instala pelo Compartilhar.
export function installSteps({ os, browser }) {
  if (os === 'ios') {
    return [
      t('Toque em Compartilhar no navegador (o quadrado com a seta para cima).'),
      t('Escolha "Adicionar à Tela de Início".'),
      t('Toque em "Adicionar" e abra o EAFIT pelo ícone.'),
    ];
  }
  if (os === 'android') {
    return [
      t('Toque no menu do navegador (⋮).'),
      t('Escolha "Instalar app" ou "Adicionar à tela inicial".'),
      t('Confirme e abra o EAFIT pelo ícone.'),
    ];
  }
  if (os === 'mac' && browser === 'safari') {
    return [
      t('No Safari, abra o menu Arquivo (ou o botão Compartilhar).'),
      t('Escolha "Adicionar ao Dock".'),
      t('Abra o EAFIT pelo Dock.'),
    ];
  }
  if (browser === 'chrome' || browser === 'edge') {
    return [
      t('Clique no ícone de instalar na barra de endereço (ou abra o menu do navegador).'),
      t('Escolha "Instalar EAFIT".'),
      t('Abra o EAFIT pelo atalho criado.'),
    ];
  }
  return null;
}

// Link do aviso de mudança de endereço (painel admin → Aviso no app /
// Mudança de endereço): https://eafit.com.br/app/?origem=mudanca. Quem chega
// por ele tinha o app instalado no endereço antigo, então a tela de instalar
// aparece antes mesmo do login. O mesmo ?origem= entra na contagem de visitas
// (lib/pageVisits.js).
export function cameFromOldAddress(search = window.location.search) {
  return new URLSearchParams(search || '').get('origem') === 'mudanca';
}

// "Agora não" vale só pra esta sessão do navegador: na próxima vez que a
// pessoa abrir o EAFIT pela aba, a tela volta.
export function isInstallSkipped() {
  try { return sessionStorage.getItem(SKIP_KEY) === '1'; } catch { return false; }
}

export function skipInstall() {
  try { sessionStorage.setItem(SKIP_KEY, '1'); } catch { /* armazenamento bloqueado */ }
}
