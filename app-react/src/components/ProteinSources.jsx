import { PROTEIN_SOURCES } from '../data/proteinSources';
import { t } from '../lib/i18n';

// Lista de consulta da aba Nutrição: quanta proteína tem em cada fonte comum.
export default function ProteinSources() {
  return (
    <details className="nutri-ref">
      <summary>{t('Fontes de proteína')}</summary>
      <ul className="protein-sources">
        {PROTEIN_SOURCES.map(s => (
          <li key={s.name} className="protein-sources__item">
            <span className="protein-sources__icon" aria-hidden="true">{s.icon}</span>
            <span className="protein-sources__name">{s.name}<small>{s.portion}</small></span>
            <strong>{s.g} g</strong>
          </li>
        ))}
      </ul>
      <p className="dash-card__subtitle">{t('Valores aproximados por porção. Não substituem orientação de nutricionista.')}</p>
    </details>
  );
}
