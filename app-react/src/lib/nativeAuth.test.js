import { describe, it, expect, vi, beforeEach } from 'vitest';

const app = vi.hoisted(() => ({ addListener: vi.fn(), getLaunchUrl: vi.fn() }));
const browser = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn() }));
vi.mock('@capacitor/app', () => ({ App: app }));
vi.mock('@capacitor/browser', () => ({ Browser: browser }));

import { parseAuthUrl, startNativeGoogleLogin, listenNativeAuthUrls, NATIVE_REDIRECT } from './nativeAuth';

describe('parseAuthUrl', () => {
  it('lê o código do Google na volta pelo esquema do app', () => {
    expect(parseAuthUrl('br.com.eafit.app://auth?code=abc123')).toEqual({ kind: 'oauth', code: 'abc123' });
  });

  it('lê erro do Google tanto na query quanto no hash', () => {
    expect(parseAuthUrl('br.com.eafit.app://auth?error=access_denied&error_description=negado'))
      .toEqual({ kind: 'error', message: 'negado' });
    expect(parseAuthUrl('br.com.eafit.app://auth#error=access_denied')).toEqual({ kind: 'error', message: 'access_denied' });
  });

  it('lê os links de e-mail do site (cadastro, senha, troca de e-mail)', () => {
    for (const type of ['signup', 'recovery', 'email_change']) {
      expect(parseAuthUrl(`https://eafit.com.br/app/?token_hash=h1&type=${type}`)).toEqual({ kind: 'email', token_hash: 'h1', type });
    }
  });

  it('ignora o que não é login: tipo desconhecido, outro site, sem código, lixo', () => {
    expect(parseAuthUrl('https://eafit.com.br/app/?token_hash=h1&type=magiclink')).toBeNull();
    expect(parseAuthUrl('https://outro.com/app/?token_hash=h1&type=signup')).toBeNull();
    expect(parseAuthUrl('https://eafit.com.br/blog?token_hash=h1&type=signup')).toBeNull();
    expect(parseAuthUrl('br.com.eafit.app://auth')).toBeNull();
    expect(parseAuthUrl('isso não é url')).toBeNull();
    expect(parseAuthUrl(undefined)).toBeNull();
  });
});

describe('startNativeGoogleLogin', () => {
  beforeEach(() => { browser.open.mockReset().mockResolvedValue(); });

  it('pede o endereço do Google sem redirecionar a página e abre no navegador do sistema', async () => {
    const db = { auth: { signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: 'https://accounts.google.com/x' }, error: null }) } };
    expect(await startNativeGoogleLogin(db)).toEqual({});
    expect(db.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google', options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
    });
    expect(browser.open).toHaveBeenCalledWith({ url: 'https://accounts.google.com/x' });
  });

  it('devolve erro se o Supabase falha ou não manda endereço', async () => {
    const fail = { auth: { signInWithOAuth: vi.fn().mockResolvedValue({ data: null, error: new Error('x') }) } };
    expect((await startNativeGoogleLogin(fail)).error).toBeInstanceOf(Error);
    const empty = { auth: { signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }) } };
    expect((await startNativeGoogleLogin(empty)).error).toBeInstanceOf(Error);
    expect(browser.open).not.toHaveBeenCalled();
  });
});

describe('listenNativeAuthUrls', () => {
  let emit;
  const remove = vi.fn();
  const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
  beforeEach(() => {
    remove.mockReset();
    app.addListener.mockReset().mockImplementation((_e, fn) => { emit = fn; return Promise.resolve({ remove }); });
    app.getLaunchUrl.mockReset().mockResolvedValue(null);
  });

  it('entrega o endereço que abriu o app do zero e os que chegam depois', async () => {
    app.getLaunchUrl.mockResolvedValue({ url: 'a://1' });
    const onUrl = vi.fn();
    listenNativeAuthUrls(onUrl);
    await flush();
    emit({ url: 'a://2' });
    expect(onUrl.mock.calls).toEqual([['a://1'], ['a://2']]);
  });

  it('não entrega o mesmo endereço duas vezes (launch + appUrlOpen)', async () => {
    app.getLaunchUrl.mockResolvedValue({ url: 'a://1' });
    const onUrl = vi.fn();
    listenNativeAuthUrls(onUrl);
    await flush();
    emit({ url: 'a://1' });
    expect(onUrl).toHaveBeenCalledTimes(1);
  });

  it('ao parar, remove o ouvinte e ignora o que vier depois', async () => {
    const onUrl = vi.fn();
    const stop = listenNativeAuthUrls(onUrl);
    await flush();
    stop();
    expect(remove).toHaveBeenCalled();
    emit({ url: 'a://3' });
    expect(onUrl).not.toHaveBeenCalled();
  });
});
