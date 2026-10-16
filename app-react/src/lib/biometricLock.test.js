// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  LOCK_KEY, RELOCK_AFTER_MS, getLock, enableLock, disableLock, verifyLock,
  isBiometricAvailable, isCancelled, noteFreshLogin,
} from './biometricLock';
import { useBiometricLock } from '../hooks/useBiometricLock';
import { clearUserLocalData } from './localData';

const USER = { id: 'u1', email: 'ana@x.com', user_metadata: { nome: 'Ana' } };
const RAW_ID = new Uint8Array([1, 2, 250, 251, 255]).buffer;

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  localStorage.clear();
  noteFreshLogin(null);
  Object.defineProperty(navigator, 'credentials', {
    value: { create: vi.fn().mockResolvedValue({ rawId: RAW_ID }), get: vi.fn().mockResolvedValue({ id: 'x' }) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.PublicKeyCredential;
});

describe('biometricLock', () => {
  it('ligar cria a credencial do aparelho com verificação obrigatória e guarda o id', async () => {
    await enableLock(USER);
    const { publicKey } = navigator.credentials.create.mock.calls[0][0];
    expect(publicKey.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required' });
    expect(new TextDecoder().decode(publicKey.user.id)).toBe('u1');
    expect(getLock('u1').credentialId).toBe('AQL6-_8');
  });

  it('desbloquear pede a mesma credencial guardada', async () => {
    const lock = await enableLock(USER);
    await expect(verifyLock(lock)).resolves.toBe(true);
    const { publicKey } = navigator.credentials.get.mock.calls[0][0];
    expect([...publicKey.allowCredentials[0].id]).toEqual([1, 2, 250, 251, 255]);
    expect(publicKey.userVerification).toBe('required');
  });

  it('a trava é da conta que ligou: outra conta não a vê', async () => {
    await enableLock(USER);
    expect(getLock('u2')).toBeNull();
    expect(getLock(null)).toBeNull();
  });

  it('desligar e sair da conta apagam a trava', async () => {
    await enableLock(USER);
    disableLock();
    expect(getLock('u1')).toBeNull();
    await enableLock(USER);
    clearUserLocalData();
    expect(localStorage.getItem(LOCK_KEY)).toBeNull();
  });

  it('valor corrompido no armazenamento conta como sem trava', () => {
    localStorage.setItem(LOCK_KEY, '{quebrado');
    expect(getLock('u1')).toBeNull();
  });

  it('sem WebAuthn ou sem sensor no aparelho, a opção não aparece', async () => {
    expect(await isBiometricAvailable()).toBe(false);
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(false) };
    expect(await isBiometricAvailable()).toBe(false);
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable.mockResolvedValue(true);
    expect(await isBiometricAvailable()).toBe(true);
  });

  it('cancelar a janela do sistema não é erro', () => {
    expect(isCancelled({ name: 'NotAllowedError' })).toBe(true);
    expect(isCancelled({ name: 'AbortError' })).toBe(true);
    expect(isCancelled({ name: 'InvalidStateError' })).toBe(false);
  });
});

describe('useBiometricLock', () => {
  it('sem trava ligada o app abre direto', () => {
    const { result } = renderHook(() => useBiometricLock('u1'));
    expect(result.current[0]).toBe(false);
  });

  it('com trava ligada abre fechado e destrava', async () => {
    await enableLock(USER);
    const { result } = renderHook(() => useBiometricLock('u1'));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it('quem acabou de entrar com a senha não vê a trava', async () => {
    await enableLock(USER);
    noteFreshLogin('u1');
    const { result } = renderHook(() => useBiometricLock('u1'));
    expect(result.current[0]).toBe(false);
  });

  it('volta a fechar só depois de um tempo em segundo plano', async () => {
    vi.useFakeTimers();
    await enableLock(USER);
    const { result } = renderHook(() => useBiometricLock('u1'));
    act(() => result.current[1]());

    act(() => setVisibility('hidden'));
    vi.advanceTimersByTime(RELOCK_AFTER_MS - 1000);
    act(() => setVisibility('visible'));
    expect(result.current[0]).toBe(false);

    act(() => setVisibility('hidden'));
    vi.advanceTimersByTime(RELOCK_AFTER_MS);
    act(() => setVisibility('visible'));
    expect(result.current[0]).toBe(true);
  });

  it('trava ligada na sessão atual não fecha o app na hora', async () => {
    const { result, rerender } = renderHook(() => useBiometricLock('u1'));
    await enableLock(USER);
    rerender();
    expect(result.current[0]).toBe(false);
  });
});
