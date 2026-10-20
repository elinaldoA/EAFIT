import { createContext, useContext } from 'react';
import { DEFAULT_CONFIG } from '../lib/appConfig';

// Fora do AppConfigContext.jsx pelo mesmo motivo de useAuth.js (Fast Refresh).
// O valor padrão é "tudo liberado", então componentes e testes que rodam sem
// o provider continuam funcionando.
export const AppConfigContext = createContext({ config: DEFAULT_CONFIG, loaded: false });

export function useAppConfig() {
  return useContext(AppConfigContext);
}

// Variante do experimento A/B para quem está logado, ou null (fora do público,
// experimento parado ou ainda carregando). Ver Sistema → Experimentos no painel.
export function useExperiment(key) {
  return useContext(AppConfigContext).config.experiments?.[key] ?? null;
}
