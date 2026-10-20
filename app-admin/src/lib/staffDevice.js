// Marca este navegador como de admin: o site e o app param de contar as
// visitas e eventos dele (mesma chave de app-react/src/lib/staffDevice.js).
export function markStaffDevice() {
  try { localStorage.setItem('eafit_staff_device', '1'); } catch { /* sem armazenamento */ }
}
