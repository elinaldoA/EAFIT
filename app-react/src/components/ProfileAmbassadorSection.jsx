import { useEffect, useState } from 'react';
import { fetchMyAmbassador } from '../lib/ambassador';
import { goTo } from '../lib/appNav';
import { programLabels } from '../lib/programLabels';

import { t } from '../lib/i18n';

// Perfil → Embaixador / Influenciador: só aparece para quem está no programa.
// O painel em si fica no modo do programa (app-react/src/program/); aqui fica o
// atalho, com o total de cadastros.
export default function ProfileAmbassadorSection() {
  const [amb, setAmb] = useState(null);

  useEffect(() => {
    let active = true;
    fetchMyAmbassador(30).then(a => { if (active) setAmb(a); }).catch(() => { /* sem atalho */ });
    return () => { active = false; };
  }, []);

  if (!amb) return null;

  const labels = programLabels(amb.kind);
  const summary = amb.active
    ? t('{total} cadastros pelo seu link', { total: amb.total })
    : t('Link pausado pela equipe EAFIT');

  return (
    <div className="section-group">
      <div className="section-group__label">{labels.group}</div>
      <button type="button" className="shortcut-card" onClick={() => goTo({ mode: 'program', tab: 'resultados' })}>
        <span className="collapse__icon" aria-hidden="true">📣</span>
        <span className="collapse__text">
          <span className="collapse__title">{labels.openMode}</span>
          <span className="collapse__summary">{summary}</span>
        </span>
        <span className="collapse__chevron" aria-hidden="true">›</span>
      </button>
    </div>
  );
}
