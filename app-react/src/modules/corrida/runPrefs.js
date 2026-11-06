// Preferências do EAFIT Run guardadas no aparelho (não na conta): voz a cada km,
// pausa automática e GPS ligado por padrão. A tela da corrida e a aba Gravar
// leem e gravam aqui; o Perfil também (RunProfile.jsx). Ligado é o padrão.

export const VOICE_KEY = 'eafit_run_voice';
export const AUTOPAUSE_KEY = 'eafit_run_autopause';
export const GPS_KEY = 'eafit_run_gps';

export function readPref(key) {
  try { return localStorage.getItem(key) !== 'off'; } catch { return true; }
}

export function writePref(key, on) {
  try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* sem storage */ }
}
