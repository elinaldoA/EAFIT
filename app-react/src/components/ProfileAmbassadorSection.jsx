import { useEffect, useState } from 'react';
import CollapsibleCard from './CollapsibleCard';
import { AmbassadorLink, AmbassadorResults } from './AmbassadorPanel';
import { fetchMyAmbassador, isInfluencer } from '../lib/ambassador';
import { goTo } from '../lib/appNav';

import { t } from '../lib/i18n';

// Perfil → Embaixador: só aparece para quem está no programa. Mostra o link e
// os números do que a pessoa trouxe — nunca quem se cadastrou. Influenciador
// (mesmo programa, outro nome) tem o modo Influenciador; aqui fica o atalho.
export default function ProfileAmbassadorSection({ toast }) {
  const [amb, setAmb] = useState(null);

  useEffect(() => {
    let active = true;
    fetchMyAmbassador(30).then(a => { if (active) setAmb(a); }).catch(() => { /* sem painel */ });
    return () => { active = false; };
  }, []);

  if (!amb) return null;

  const summary = amb.active
    ? t('{total} cadastros pelo seu link', { total: amb.total })
    : t('Link pausado pela equipe EAFIT');

  if (isInfluencer(amb)) {
    return (
      <div className="section-group">
        <div className="section-group__label">{t('Influenciador EAFIT')}</div>
        <button type="button" className="shortcut-card" onClick={() => goTo({ mode: 'influencer', tab: 'resultados' })}>
          <span className="collapse__icon" aria-hidden="true">📣</span>
          <span className="collapse__text">
            <span className="collapse__title">{t('Abrir modo Influenciador')}</span>
            <span className="collapse__summary">{summary}</span>
          </span>
          <span className="collapse__chevron" aria-hidden="true">›</span>
        </button>
      </div>
    );
  }

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Embaixador EAFIT')}</div>
      <CollapsibleCard icon="📣" title={t('Painel do embaixador')} summary={summary}>
        <div className="amb">
          <AmbassadorLink amb={amb} toast={toast} />
          <AmbassadorResults initial={amb} />
        </div>
      </CollapsibleCard>
    </div>
  );
}
