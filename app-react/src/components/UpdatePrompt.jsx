import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_INTERVAL_MS = 60_000;
const RELOAD_FALLBACK_MS = 5_000;
// Depois de atualizar, não oferece outra atualização por um tempo. O GitHub
// Pages serve sw.js por CDN com cache: logo após o deploy, uma checagem pode
// pegar a versão ANTIGA do sw.js, que o navegador trata como "nova" e deixa
// esperando — o aviso voltava logo após atualizar, em ciclo.
const SUPPRESS_AFTER_UPDATE_MS = 10 * 60_000;
const UPDATED_KEY = 'eafit_sw_updated_at';

function recentlyUpdated() {
  try {
    const at = Number(localStorage.getItem(UPDATED_KEY));
    return at > 0 && Date.now() - at < SUPPRESS_AFTER_UPDATE_MS;
  } catch { return false; }
}

// Aviso de versão nova do app (service worker novo esperando pra ativar).
// Cartão flutuante acima da navegação inferior — a faixa fina antiga, colada
// no topo por cima do cabeçalho, passava despercebida.
//
// Checa atualização no intervalo E sempre que o app volta pro primeiro plano
// ou a conexão volta: no celular, com o PWA em segundo plano, o setInterval
// fica congelado, e é justamente ao reabrir o app que o usuário precisa ver o
// aviso.
export default function UpdatePrompt({ aboveNav = false }) {
  const registrationRef = useRef(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [, setTick] = useState(0);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      setInterval(() => {
        if (!recentlyUpdated()) registration.update().catch(() => {});
      }, CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    function check() {
      if (document.visibilityState === 'visible' && navigator.onLine && !recentlyUpdated()) {
        registrationRef.current?.update().catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
    };
  }, []);

  const suppressed = recentlyUpdated();
  useEffect(() => {
    if (!suppressed) return undefined;
    const id = setTimeout(() => setTick(n => n + 1), SUPPRESS_AFTER_UPDATE_MS);
    return () => clearTimeout(id);
  }, [suppressed]);

  if (!needRefresh || dismissed || suppressed) return null;

  // O reload automático do vite-plugin-pwa depende do evento "controlling" do
  // workbox-window vir marcado como isUpdate — o que não acontece quando a
  // versão nova é a segunda encontrada na mesma sessão (app aberto por muito
  // tempo, dois deploys seguidos): o SW novo ativa, mas a página não recarrega
  // e o botão parece não fazer nada. Recarrega aqui mesmo quando o SW novo
  // assume a página, com um fallback caso o evento nunca chegue.
  function handleUpdate() {
    setUpdating(true);
    try { localStorage.setItem(UPDATED_KEY, String(Date.now())); } catch { /* sem storage: segue sem a trava */ }
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
    setTimeout(reload, RELOAD_FALLBACK_MS);
    updateServiceWorker(true);
  }

  return (
    <div className={`update-card${aboveNav ? ' update-card--above-nav' : ''}`} role="alert">
      <div className="update-card__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" />
        </svg>
      </div>
      <div className="update-card__text">
        <strong className="update-card__title">Nova versão disponível</strong>
        <span className="update-card__desc">Atualize para usar as melhorias mais recentes.</span>
      </div>
      <div className="update-card__actions">
        <button type="button" className="update-card__later" onClick={() => setDismissed(true)} disabled={updating}>
          Depois
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={handleUpdate} disabled={updating}>
          {updating ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
    </div>
  );
}
