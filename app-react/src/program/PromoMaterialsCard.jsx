import { useEffect, useState } from 'react';
import { downloadPromoMaterial, fetchPromoMaterials, formatSize, materialIcon } from '../lib/promoMaterials';
import { timeAgo } from '../lib/inbox';

import { t } from '../lib/i18n';

// Modo do programa → Divulgar: material que a equipe EAFIT preparou para postar.
export default function PromoMaterialsCard({ toast }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    let active = true;
    fetchPromoMaterials()
      .then(list => { if (active) setItems(list); })
      .catch(err => { console.error('fetchPromoMaterials:', err); if (active) setError(true); });
    return () => { active = false; };
  }, []);

  async function handleDownload(item) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await downloadPromoMaterial(item);
    } catch (err) {
      console.error('downloadPromoMaterial:', err);
      toast(t('⚠️ Não deu pra baixar o arquivo. Tente de novo.'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('📦 Material de divulgação')}</div>
      <p className="profile-field__hint mt-0">{t('Logos, imagens e vídeos que a equipe EAFIT preparou para você postar.')}</p>
      {error && <p className="profile-field__hint">{t('Não foi possível carregar o material agora.')}</p>}
      {!items && !error && <div className="skeleton" style={{ height: 60 }} />}
      {items && items.length === 0 && (
        <p className="profile-field__hint m-0">{t('Ainda não há material. Quando a equipe publicar, ele aparece aqui.')}</p>
      )}
      {items && items.length > 0 && (
        <ul className="promo-list">
          {items.map(item => (
            <li key={item.id} className="promo-list__item">
              <span className="promo-list__icon" aria-hidden="true">{materialIcon(item.mime_type)}</span>
              <div className="promo-list__text">
                <strong>{item.title}</strong>
                {item.description && <span>{item.description}</span>}
                <small>{formatSize(item.size_bytes)} · {timeAgo(item.created_at)}</small>
              </div>
              <button type="button" className="btn btn--outline btn--sm" disabled={busyId === item.id} onClick={() => handleDownload(item)}>
                {busyId === item.id ? t('Baixando…') : t('Baixar')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
