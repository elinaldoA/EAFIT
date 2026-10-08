// Classificação do aparelho em poucas categorias, só pra estatística agregada
// do painel admin. O user-agent em si nunca é gravado. A MESMA regra está
// copiada no <script> de public/landing/index.html, que não tem build: mudou
// aqui, mude lá.

// Android antes de Linux: todo Android se declara Linux. iPad recente se
// apresenta como Mac — o que o diferencia é ter tela de toque.
export function detectOS(userAgent, platform, maxTouchPoints) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'outro';
  if (ua.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  const mac = ua.includes('macintosh') || ua.includes('mac os x') || /^mac/i.test(platform || '');
  if (mac) return maxTouchPoints > 1 ? 'ios' : 'mac';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('cros')) return 'outro';
  if (ua.includes('linux') || ua.includes('x11')) return 'linux';
  return 'outro';
}

// A ordem importa: Edge, Samsung e Opera também dizem "Chrome", e todo
// Chrome também diz "Safari".
export function detectBrowser(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'outro';
  if (/edg(e|a|ios)?\//.test(ua)) return 'edge';
  if (ua.includes('samsungbrowser')) return 'samsung';
  if (/opr\/|opera|opt\//.test(ua)) return 'opera';
  if (/firefox|fxios/.test(ua)) return 'firefox';
  if (/chrome|crios|chromium/.test(ua)) return 'chrome';
  if (ua.includes('safari')) return 'safari';
  return 'outro';
}

// Android sem "mobile" no user-agent é tablet; iPad pode vir como Mac com toque.
export function detectDevice(userAgent, platform, maxTouchPoints) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'desktop';
  if (ua.includes('ipad')) return 'tablet';
  const mac = ua.includes('macintosh') || /^mac/i.test(platform || '');
  if (mac && maxTouchPoints > 1) return 'tablet';
  if (ua.includes('android')) return ua.includes('mobile') ? 'celular' : 'tablet';
  if (/iphone|ipod|mobile/.test(ua)) return 'celular';
  return 'desktop';
}

// App instalado (aberto pelo ícone) ou aba do navegador.
export function detectDisplayMode(win) {
  try {
    if (win?.navigator?.standalone === true) return 'standalone';
    if (win?.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
  } catch { /* navegador sem matchMedia */ }
  return 'browser';
}

export function readClientInfo() {
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  return {
    os: detectOS(nav.userAgent, nav.platform, nav.maxTouchPoints),
    browser: detectBrowser(nav.userAgent),
    device: detectDevice(nav.userAgent, nav.platform, nav.maxTouchPoints),
  };
}
