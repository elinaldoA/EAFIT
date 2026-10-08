// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// O módulo guarda estado (evento capturado, instalado): cada teste importa uma cópia nova.
async function load() {
  vi.resetModules();
  return import('./installPrompt');
}

function fakeWindow() {
  const handlers = {};
  return {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    fire: (type, event) => handlers[type]?.(event),
  };
}

const promptEvent = (outcome = 'accepted') => ({
  preventDefault: vi.fn(),
  prompt: vi.fn(),
  userChoice: Promise.resolve({ outcome }),
});

beforeEach(() => sessionStorage.clear());

describe('installPrompt', () => {
  it('guarda o convite do navegador, avisa quem escuta e instala com um toque', async () => {
    const m = await load();
    const win = fakeWindow();
    const onChange = vi.fn();
    m.captureInstallPrompt(win);
    const unsubscribe = m.subscribeInstall(onChange);
    expect(m.getInstallState()).toBe('manual');

    const event = promptEvent('accepted');
    win.fire('beforeinstallprompt', event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(m.getInstallState()).toBe('prompt');
    expect(onChange).toHaveBeenCalledTimes(1);

    expect(await m.promptInstall()).toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);

    win.fire('appinstalled');
    expect(m.getInstallState()).toBe('installed');

    unsubscribe();
    const calls = onChange.mock.calls.length;
    win.fire('appinstalled');
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it('convite recusado não pode ser reusado: volta ao caminho manual', async () => {
    const m = await load();
    const win = fakeWindow();
    m.captureInstallPrompt(win);
    win.fire('beforeinstallprompt', promptEvent('dismissed'));
    expect(await m.promptInstall()).toBe('dismissed');
    expect(m.getInstallState()).toBe('manual');
    expect(await m.promptInstall()).toBe('unavailable');
  });

  it('falha ao abrir o convite conta como recusado', async () => {
    const m = await load();
    const win = fakeWindow();
    m.captureInstallPrompt(win);
    win.fire('beforeinstallprompt', { preventDefault() {}, prompt() { throw new Error('gesto'); } });
    expect(await m.promptInstall()).toBe('dismissed');
  });

  it('passo a passo por plataforma; sem instalação possível devolve null', async () => {
    const m = await load();
    expect(m.installSteps({ os: 'ios', browser: 'safari' })[1]).toMatch(/Tela de Início/);
    expect(m.installSteps({ os: 'ios', browser: 'chrome' })[1]).toMatch(/Tela de Início/);
    expect(m.installSteps({ os: 'android', browser: 'firefox' })[1]).toMatch(/Instalar app/);
    expect(m.installSteps({ os: 'mac', browser: 'safari' })[1]).toMatch(/Dock/);
    expect(m.installSteps({ os: 'mac', browser: 'chrome' })[1]).toMatch(/Instalar EAFIT/);
    expect(m.installSteps({ os: 'windows', browser: 'edge' })[1]).toMatch(/Instalar EAFIT/);
    expect(m.installSteps({ os: 'windows', browser: 'firefox' })).toBeNull();
    expect(m.installSteps({ os: 'linux', browser: 'outro' })).toBeNull();
  });

  it('"agora não" vale pela sessão do navegador', async () => {
    const m = await load();
    expect(m.isInstallSkipped()).toBe(false);
    m.skipInstall();
    expect(m.isInstallSkipped()).toBe(true);
    sessionStorage.clear();
    expect(m.isInstallSkipped()).toBe(false);
  });
});
