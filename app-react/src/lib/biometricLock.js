// Trava do app com a biometria do aparelho (digital, Face ID, Windows Hello)
// via WebAuthn. É uma trava de tela, não um login: a sessão do Supabase segue
// guardada como sempre, e a credencial só serve para o aparelho confirmar que
// quem está com ele é o dono. Por isso não há servidor nem verificação de
// assinatura — basta o navegador devolver a asserção com o usuário verificado.
// Vale por aparelho e por conta: sair da conta apaga a trava (localData.js).
export const LOCK_KEY = 'eafit_bio_lock';

// Tempo em segundo plano a partir do qual a volta para o app pede biometria de novo.
export const RELOCK_AFTER_MS = 5 * 60 * 1000;

const TIMEOUT_MS = 60000;

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function toBase64Url(buffer) {
  const bin = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// Só com autenticador do próprio aparelho que verifica o usuário — chave de
// segurança USB/NFC não conta, a ideia é desbloquear com o dedo ou o rosto.
export async function isBiometricAvailable() {
  if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Trava ligada para esta conta neste aparelho (ou null).
export function getLock(userId) {
  if (!userId) return null;
  const lock = safe(() => JSON.parse(localStorage.getItem(LOCK_KEY)), null);
  return lock?.userId === userId && lock.credentialId ? lock : null;
}

export function disableLock() {
  safe(() => localStorage.removeItem(LOCK_KEY));
}

// Cria a credencial no aparelho (o sistema pede a biometria na hora) e liga a
// trava. O user.id da credencial é o id da conta: ligar de novo substitui a
// anterior no aparelho em vez de acumular entradas.
export async function enableLock(user) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'EAFIT' },
      user: {
        id: new TextEncoder().encode(user.id),
        name: user.email || user.id,
        displayName: user.user_metadata?.nome || user.email || 'EAFIT',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none',
      timeout: TIMEOUT_MS,
    },
  });
  if (!credential) throw new Error('no-credential');
  const lock = { userId: user.id, credentialId: toBase64Url(credential.rawId), createdAt: new Date().toISOString() };
  safe(() => localStorage.setItem(LOCK_KEY, JSON.stringify(lock)));
  return lock;
}

// Pede a biometria para a credencial guardada. Resolve true se o aparelho
// confirmou; cancelar ou falhar rejeita com o erro do navegador.
export async function verifyLock(lock) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: fromBase64Url(lock.credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: TIMEOUT_MS,
    },
  });
  return !!assertion;
}

// Cancelou a janela do sistema (ou ela expirou) — não é erro para mostrar.
export function isCancelled(err) {
  return err?.name === 'NotAllowedError' || err?.name === 'AbortError';
}

// Login com senha acabou de acontecer nesta página: a pessoa já provou quem é,
// então a trava não aparece por cima logo em seguida.
let freshLoginUser = null;

export function noteFreshLogin(userId) {
  freshLoginUser = userId;
}

export function isFreshLogin(userId) {
  return !!userId && freshLoginUser === userId;
}
