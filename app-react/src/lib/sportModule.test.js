// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { availableModules, resolveModule, brandName, applyModuleTheme, cachedModulesConfig, cacheModulesConfig, withBetaModules } from './sportModule';
import { MODULES, DEFAULT_MODULE_ID, BASE_TABS } from '../modules/registry';

const REGISTRY = [
  { id: 'musculacao', name: '', label: 'Musculação', icon: '🏋️', tabs: BASE_TABS, defaultTab: 'treino', released: true },
  { id: 'corrida', name: 'Run', label: 'Corrida', icon: '🏃', tabs: ['treino', 'perfil'], defaultTab: 'treino', released: false },
  { id: 'luta', name: 'Fight', label: 'Lutas', icon: '🥊', tabs: ['treino', 'perfil'], defaultTab: 'treino', released: true },
];

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-module');
});

describe('registro de módulos', () => {
  it('a musculação é o padrão, lançada e com as seis abas de sempre', () => {
    const base = MODULES.find(m => m.id === DEFAULT_MODULE_ID);
    expect(base).toMatchObject({ released: true, name: '', defaultTab: 'treino' });
    expect(base.tabs).toEqual(['treino', 'historico', 'hidratacao', 'nutricao', 'dash', 'perfil']);
  });

  it('ids únicos e aba inicial entre as abas do módulo', () => {
    expect(new Set(MODULES.map(m => m.id)).size).toBe(MODULES.length);
    for (const m of MODULES) expect(m.tabs).toContain(m.defaultTab);
  });
});

describe('availableModules', () => {
  it('padrão e lançados sempre; não lançado só quando o painel libera', () => {
    expect(availableModules(undefined, REGISTRY).map(m => m.id)).toEqual(['musculacao', 'luta']);
    expect(availableModules({ enabled: ['corrida'] }, REGISTRY).map(m => m.id)).toEqual(['musculacao', 'corrida', 'luta']);
  });
});

describe('withBetaModules', () => {
  it('libera para a conta de teste o módulo que ainda não saiu para todos', () => {
    const cfg = withBetaModules({ enabled: [] }, { beta_modules: ['corrida'] });
    expect(availableModules(cfg).map(m => m.id)).toContain('corrida');
    expect(resolveModule({ esporte: 'corrida' }, cfg).id).toBe('corrida');
  });

  it('sem marca de teste fica como o painel mandou', () => {
    const cfg = { enabled: [] };
    expect(withBetaModules(cfg, { provider: 'email' })).toBe(cfg);
    expect(withBetaModules(cfg, undefined)).toBe(cfg);
    expect(resolveModule({ esporte: 'corrida' }, withBetaModules(cfg, { beta_modules: 'corrida' })).id).toBe(DEFAULT_MODULE_ID);
  });
});

describe('resolveModule', () => {
  it('sem escolha vale a musculação', () => {
    expect(resolveModule({}, undefined, REGISTRY).id).toBe('musculacao');
    expect(resolveModule(undefined, undefined, REGISTRY).id).toBe('musculacao');
  });

  it('respeita a escolha de um módulo disponível', () => {
    expect(resolveModule({ esporte: 'luta' }, undefined, REGISTRY).id).toBe('luta');
    expect(resolveModule({ esporte: 'corrida' }, { enabled: ['corrida'] }, REGISTRY).id).toBe('corrida');
  });

  it('módulo não liberado ou que não existe mais volta para a musculação', () => {
    expect(resolveModule({ esporte: 'corrida' }, { enabled: [] }, REGISTRY).id).toBe('musculacao');
    expect(resolveModule({ esporte: 'xadrez' }, undefined, REGISTRY).id).toBe('musculacao');
  });
});

describe('marca e tema', () => {
  it('EAFIT em todos; o nome do módulo vem depois', () => {
    expect(brandName(REGISTRY[0])).toBe('EAFIT');
    expect(brandName(REGISTRY[1])).toBe('EAFIT · Run');
  });

  it('marca <html data-module> só fora da musculação', () => {
    applyModuleTheme('corrida');
    expect(document.documentElement.getAttribute('data-module')).toBe('corrida');
    applyModuleTheme('musculacao');
    expect(document.documentElement.hasAttribute('data-module')).toBe(false);
  });

  it('guarda a liberação no aparelho e tolera cache torto', () => {
    expect(cachedModulesConfig()).toEqual({ enabled: [] });
    cacheModulesConfig({ enabled: ['corrida'] });
    expect(cachedModulesConfig()).toEqual({ enabled: ['corrida'] });
    localStorage.setItem('eafit_modules', '{quebrado');
    expect(cachedModulesConfig()).toEqual({ enabled: [] });
  });
});
