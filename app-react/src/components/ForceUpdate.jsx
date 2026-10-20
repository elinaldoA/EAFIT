import { useState } from 'react';
import { hardUpdate } from '../lib/appVersion';

import { t } from '../lib/i18n';

function UpdateButton({ className }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={busy} onClick={() => { setBusy(true); hardUpdate(); }}>
      {busy ? t('Atualizando…') : t('Atualizar agora')}
    </button>
  );
}

// Versão mínima ligada no painel (Configurações → Versão mínima). 'block':
// tela cheia, como a de manutenção; 'warn': faixa no topo.
export function ForceUpdateScreen({ message }) {
  return (
    <div className="boot maintenance" role="alert">
      <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />
      <div className="boot__name">EAFIT</div>
      <h1 className="maintenance__title">{t('Atualize o app')}</h1>
      <p className="maintenance__text">{message || t('Esta versão do app não é mais compatível. Atualize para continuar.')}</p>
      <UpdateButton className="btn btn--primary btn--sm" />
    </div>
  );
}

export function UpdateWarnBar({ message }) {
  return (
    <div className="announce announce--warning" role="status">
      <span className="announce__text">{message || t('Há uma versão nova do app com correções importantes.')}</span>
      <UpdateButton className="btn btn--outline btn--sm" />
    </div>
  );
}
