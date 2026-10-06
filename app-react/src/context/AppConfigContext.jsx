import { useEffect, useMemo, useState } from 'react';
import { AppConfigContext } from './useAppConfig';
import { DEFAULT_CONFIG, fetchAppConfig } from '../lib/appConfig';

const REFRESH_MS = 5 * 60_000;

// Carrega as configurações do painel admin (manutenção, aviso, recursos) e
// as relê a cada 5 min e quando o app volta pro primeiro plano. Falha de rede
// mantém a última configuração conhecida (ou o padrão liberado).
export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const next = await fetchAppConfig();
        if (active) { setConfig(next); setLoaded(true); }
      } catch {
        // fail-open: mantém o que já tinha
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const value = useMemo(() => ({ config, loaded }), [config, loaded]);
  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}
