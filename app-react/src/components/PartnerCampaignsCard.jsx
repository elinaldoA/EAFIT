import { useEffect, useState } from 'react';
import {
  campaignCaption, campaignLink, copyText, fetchCampaignMaterials, fetchMyCampaigns, isEnded, shareCampaign,
} from '../lib/partnerCampaign';
import { downloadPromoMaterial, formatSize, materialIcon } from '../lib/promoMaterials';
import { todayInAppZone } from '../lib/appConfig';

import { locale, t } from '../lib/i18n';

// "2026-12-31" → "31/12" (ou "12/31" em inglês).
const formatDateShort = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

// Campanhas da equipe EAFIT para parceiros (modo Embaixador/Influenciador →
// Divulgar e modo Personal → Painel): o link de cada um já vem marcado com a
// campanha, o texto sugerido, o material e os números do parceiro nela.
// Sem campanha ativa, o card não aparece.
export default function PartnerCampaignsCard({ toast }) {
  const [campaigns, setCampaigns] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    let active = true;
    fetchMyCampaigns()
      .then(async list => {
        if (!active) return;
        setCampaigns(list);
        const files = await fetchCampaignMaterials(list.map(c => c.id)).catch(() => []);
        if (active) setMaterials(files);
      })
      .catch(err => { console.error('fetchMyCampaigns:', err); if (active) setCampaigns([]); });
    return () => { active = false; };
  }, []);

  if (!campaigns?.length) return null;
  const today = todayInAppZone();

  async function handleShare(c) {
    const result = await shareCampaign(c);
    if (result === 'copied') toast(t('📋 Texto copiado'));
    else if (result === 'failed') toast(t('⚠️ Não deu pra copiar o texto'));
  }

  async function handleCopy(text, ok) {
    toast(await copyText(text) ? ok : t('⚠️ Não deu pra copiar o texto'));
  }

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
    <div className="dash-card partner-campaigns">
      <div className="dash-card__title">{t('📣 Campanhas')}</div>
      <p className="profile-field__hint" style={{ marginTop: 0 }}>{t('Campanhas da equipe EAFIT. Use o link de cada uma: assim os cadastros contam para você nela.')}</p>
      {campaigns.map(c => {
        const ended = isEnded(c, today);
        const caption = campaignCaption(c);
        const files = materials.filter(m => m.campaign_id === c.id);
        return (
          <div key={c.id} className="partner-campaign">
            <div className="partner-campaign__head">
              <strong>{c.title}</strong>
              <small>
                {ended
                  ? t('Encerrada em {date}', { date: formatDateShort(c.endsOn) })
                  : c.endsOn ? t('Até {date}', { date: formatDateShort(c.endsOn) }) : t('Sem data para acabar')}
              </small>
            </div>
            {c.description && <p className="partner-campaign__text">{c.description}</p>}
            {c.goal && <p className="partner-campaign__goal">🎯 {c.goal}</p>}

            <div className="recap__grid">
              <div className="recap__stat"><span className="recap__value">{c.visits}</span><span className="recap__label">{t('visitas pelo link da campanha')}</span></div>
              <div className="recap__stat"><span className="recap__value">{c.signups}</span><span className="recap__label">{t('contas criadas na campanha')}</span></div>
            </div>

            {!ended && (
              <>
                <code className="trainer-link__url">{campaignLink(c)}</code>
                <div className="trainer-link__actions">
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => handleShare(c)}>{t('Compartilhar')}</button>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => handleCopy(campaignLink(c), t('🔗 Link copiado'))}>{t('Copiar link')}</button>
                </div>
                {caption && (
                  <div className="influencer-caption">
                    <div className="amb__label">{t('Texto sugerido')}</div>
                    <p className="influencer-caption__text">{caption}</p>
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => handleCopy(caption, t('📋 Texto copiado'))}>{t('Copiar texto')}</button>
                  </div>
                )}
                {files.length > 0 && (
                  <ul className="promo-list">
                    {files.map(item => (
                      <li key={item.id} className="promo-list__item">
                        <span className="promo-list__icon" aria-hidden="true">{materialIcon(item.mime_type)}</span>
                        <div className="promo-list__text">
                          <strong>{item.title}</strong>
                          {item.description && <span>{item.description}</span>}
                          <small>{formatSize(item.size_bytes)}</small>
                        </div>
                        <button type="button" className="btn btn--outline btn--sm" disabled={busyId === item.id} onClick={() => handleDownload(item)}>
                          {busyId === item.id ? t('Baixando…') : t('Baixar')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
