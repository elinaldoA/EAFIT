import { useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { useAppConfig } from '../context/useAppConfig';
import { MODULES } from '../modules/registry';
import { availableModules, resolveModule, cachedModulesConfig, cacheModulesConfig, withBetaModules } from '../lib/sportModule';

// Módulo de esporte da pessoa logada (lib/sportModule.js) e os que ela pode
// escolher. Trocar o esporte no Perfil grava na conta e a troca vale na hora.
export function useSportModule() {
  const { user } = useAuth();
  const { config, loaded } = useAppConfig();
  const fromPanel = loaded ? config.modules : cachedModulesConfig();
  // Em desenvolvimento (npm run dev) todo módulo aparece, para testar antes de liberar.
  const modulesConfig = import.meta.env.MODE === 'development'
    ? { enabled: MODULES.map(m => m.id) }
    : withBetaModules(fromPanel, user?.app_metadata);

  useEffect(() => {
    if (loaded) cacheModulesConfig(config.modules);
  }, [loaded, config.modules]);

  return {
    module: resolveModule(user?.user_metadata, modulesConfig),
    available: availableModules(modulesConfig),
  };
}
