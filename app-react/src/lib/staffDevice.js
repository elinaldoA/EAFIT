// Navegador usado por admin: visitas ao site e à tela de acesso, eventos
// anônimos e instalação deixam de contar nas métricas. A marca é gravada
// quando uma conta admin entra no painel (app-admin/src/lib/staffDevice.js) ou
// tenta entrar no app; o site (public/landing/assets/site.js) lê a mesma chave.
// Mesmo domínio (site, /app e /admin) = mesmo localStorage.
export const STAFF_DEVICE_KEY = 'eafit_staff_device';

export function markStaffDevice() {
  try { localStorage.setItem(STAFF_DEVICE_KEY, '1'); } catch { /* sem armazenamento */ }
}

export function isStaffDevice() {
  try { return localStorage.getItem(STAFF_DEVICE_KEY) === '1'; } catch { return false; }
}
