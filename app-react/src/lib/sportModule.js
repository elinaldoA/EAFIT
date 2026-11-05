import { DEFAULT_MODULE_ID, MODULES } from '../modules/registry';

// Qual versão do app (módulo de esporte, modules/registry.js) cada pessoa vê.
// Sem escolha, com escolha de um módulo que não existe mais ou que ainda não
// foi liberado, vale a musculação — o app de sempre.

const CACHE_KEY = 'eafit_modules';

// Módulos que podem ser escolhidos agora: o padrão, os lançados e os que o
// painel admin liberou (app_settings.modules.enabled).
export function availableModules(modulesConfig, registry = MODULES) {
  const enabled = Array.isArray(modulesConfig?.enabled) ? modulesConfig.enabled : [];
  return registry.filter(m => m.id === DEFAULT_MODULE_ID || m.released || enabled.includes(m.id));
}

// Teste fechado: módulo ainda não liberado para todos, mas liberado para uma
// conta em app_metadata.beta_modules (ex.: ["corrida"]). app_metadata só é
// gravado pelo servidor (SQL ou service role), então ninguém se libera sozinho.
// Vale depois que a sessão renova o token (até 1 h) ou num novo login.
export function withBetaModules(modulesConfig, appMetadata) {
  const enabled = Array.isArray(modulesConfig?.enabled) ? modulesConfig.enabled : [];
  const beta = Array.isArray(appMetadata?.beta_modules)
    ? appMetadata.beta_modules.filter(id => typeof id === 'string')
    : [];
  if (!beta.length) return modulesConfig;
  return { ...modulesConfig, enabled: [...new Set([...enabled, ...beta])] };
}

export function resolveModule(metadata, modulesConfig, registry = MODULES) {
  const list = availableModules(modulesConfig, registry);
  return list.find(m => m.id === metadata?.esporte)
    || list.find(m => m.id === DEFAULT_MODULE_ID)
    || registry[0];
}

// A marca EAFIT vai em todos os módulos; o nome do módulo vem depois dela.
export const brandName = module => (module?.name ? `EAFIT · ${module.name}` : 'EAFIT');

// Cores e detalhes do módulo (styles/modules.css) via <html data-module>. A
// musculação não marca nada: é o visual padrão de tokens.css.
export function applyModuleTheme(id, root = document.documentElement) {
  if (id && id !== DEFAULT_MODULE_ID) root.setAttribute('data-module', id);
  else root.removeAttribute('data-module');
}

// Última liberação conhecida guardada no aparelho: até a configuração do
// painel chegar, quem está num módulo liberado não pisca na musculação.
export function cachedModulesConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return parsed && Array.isArray(parsed.enabled) ? parsed : { enabled: [] };
  } catch {
    return { enabled: [] };
  }
}

export function cacheModulesConfig(modulesConfig) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ enabled: modulesConfig?.enabled || [] }));
  } catch { /* armazenamento bloqueado */ }
}
