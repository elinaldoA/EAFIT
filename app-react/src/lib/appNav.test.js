// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { goTo, takeProfileCardToOpen, capturePushTarget, NAV_EVENT } from './appNav';
import { NAV_TARGETS } from './pushTarget';
import { readMode } from './appMode';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/EAFIT/');
});

describe('goTo', () => {
  it('troca a aba, anota a aba do Dashboard e avisa o app', () => {
    const onNav = vi.fn();
    window.addEventListener(NAV_EVENT, onNav);
    goTo(NAV_TARGETS.amigos);
    window.removeEventListener(NAV_EVENT, onNav);
    expect(window.location.hash).toBe('#dash');
    expect(localStorage.getItem('dash_tab')).toBe('amigos');
    expect(readMode()).toBe('aluno');
    expect(onNav).toHaveBeenCalledTimes(1);
  });

  it('cartão do Perfil é lido uma vez só', () => {
    goTo(NAV_TARGETS.peso);
    expect(window.location.hash).toBe('#perfil');
    expect(takeProfileCardToOpen()).toBe('corpo');
    expect(takeProfileCardToOpen()).toBe('');
  });

  it('destino do personal troca o modo; o de aula mantém o modo atual', () => {
    goTo(NAV_TARGETS.treino);
    goTo(NAV_TARGETS.aula);
    expect(readMode()).toBe('aluno');
    goTo(NAV_TARGETS.personal_recados);
    expect(readMode()).toBe('trainer');
    expect(window.location.hash).toBe('#recados');
    goTo(NAV_TARGETS.aula);
    expect(readMode()).toBe('trainer');
  });

  it('sem destino não faz nada', () => {
    const onNav = vi.fn();
    window.addEventListener(NAV_EVENT, onNav);
    goTo(undefined);
    window.removeEventListener(NAV_EVENT, onNav);
    expect(window.location.hash).toBe('');
    expect(onNav).not.toHaveBeenCalled();
  });
});

describe('capturePushTarget', () => {
  it('app aberto pela notificação já começa na tela do destino, sem empilhar histórico', () => {
    window.history.replaceState(null, '', '/EAFIT/?push=agua');
    const before = window.history.length;
    capturePushTarget();
    expect(window.location.hash).toBe('#hidratacao');
    expect(window.location.search).toBe('?push=agua');
    expect(window.history.length).toBe(before);
  });

  it('?push=1 (comunicado sem destino) ou abertura normal não mexem na aba', () => {
    window.history.replaceState(null, '', '/EAFIT/?push=1#historico');
    capturePushTarget();
    expect(window.location.hash).toBe('#historico');
  });

  it('com o app aberto, a mensagem do service worker leva ao destino', () => {
    let onMessage;
    const sw = { addEventListener: (type, fn) => { onMessage = fn; } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
    capturePushTarget();
    onMessage({ data: { type: 'eafit-push-open', target: 'recordes' } });
    expect(window.location.hash).toBe('#dash');
    expect(localStorage.getItem('dash_tab')).toBe('recordes');
    onMessage({ data: { type: 'outra' } });
    onMessage({ data: { type: 'eafit-push-open' } });
    expect(window.location.hash).toBe('#dash');
    delete navigator.serviceWorker;
  });
});
