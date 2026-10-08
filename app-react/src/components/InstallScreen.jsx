import { useState, useSyncExternalStore } from 'react';
import { readClientInfo, detectDisplayMode } from '../lib/clientInfo';
import {
  subscribeInstall, getInstallState, promptInstall, installSteps, isInstallSkipped, skipInstall,
} from '../lib/installPrompt';

import { t } from '../lib/i18n';
// Tela cheia pra quem abre o EAFIT numa aba do navegador: leva a instalar o
// app (botão de instalar quando o navegador oferece, senão o passo a passo do
// menu). Não aparece no app instalado nem em navegador que não instala.
export default function InstallScreen() {
  const state = useSyncExternalStore(subscribeInstall, getInstallState);
  const [client] = useState(readClientInfo);
  const [standalone] = useState(() => detectDisplayMode(window) === 'standalone');
  const [skipped, setSkipped] = useState(isInstallSkipped);
  const [busy, setBusy] = useState(false);

  if (standalone || skipped) return null;
  const steps = installSteps(client);
  if (state === 'manual' && !steps) return null;

  function handleSkip() {
    skipInstall();
    setSkipped(true);
  }

  async function handleInstall() {
    setBusy(true);
    await promptInstall();
    setBusy(false);
  }

  const icon = <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />;

  if (state === 'installed') {
    return (
      <div className="boot maintenance" role="dialog" aria-modal="true" aria-labelledby="install-title">
        {icon}
        <h1 className="maintenance__title" id="install-title">{t('App instalado!')}</h1>
        <p className="maintenance__text">{t('Feche esta aba e abra o EAFIT pelo ícone do app.')}</p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleSkip}>{t('Continuar no navegador')}</button>
      </div>
    );
  }

  return (
    <div className="boot maintenance" role="dialog" aria-modal="true" aria-labelledby="install-title">
      {icon}
      <h1 className="maintenance__title" id="install-title">{t('Instale o app EAFIT')}</h1>
      <p className="maintenance__text">
        {t('Você está usando o EAFIT pelo navegador. Com o app instalado ele abre direto da tela inicial, funciona sem internet e envia seus lembretes.')}
      </p>
      {state === 'prompt' ? (
        <button type="button" className="btn btn--primary" disabled={busy} onClick={handleInstall}>{t('Instalar app')}</button>
      ) : (
        <ol className="install__steps">
          {steps.map(step => <li key={step}>{step}</li>)}
        </ol>
      )}
      {client.os === 'ios' && (
        <p className="maintenance__text">{t('No app instalado, entre de novo com o mesmo e-mail e senha.')}</p>
      )}
      <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={handleSkip}>{t('Agora não')}</button>
    </div>
  );
}
