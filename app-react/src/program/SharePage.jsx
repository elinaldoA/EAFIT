import { useToast } from '../context/useToast';
import { AmbassadorLink, AmbassadorQr } from '../components/AmbassadorPanel';
import { INFLUENCER_CAPTIONS, captionText, copyCaption } from '../lib/ambassador';
import PromoMaterialsCard from './PromoMaterialsCard';

import { t } from '../lib/i18n';

// Modo do programa → Divulgar: link com código, compartilhar por canal, QR,
// textos prontos para copiar (o link de cada texto já vai com o canal) e o
// material de divulgação da equipe.
export default function SharePage({ amb }) {
  const toast = useToast();

  async function handleCopy(caption) {
    toast(await copyCaption(amb.code, caption) ? t('📋 Texto copiado') : t('⚠️ Não deu pra copiar o texto'));
  }

  return (
    <section className="page active trainer-page">
      <div className="dash-card">
        <div className="dash-card__title">{t('🔗 Seu link')}</div>
        <div className="amb">
          <AmbassadorLink amb={amb} toast={toast} />
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card__title">{t('📱 QR Code')}</div>
        <AmbassadorQr amb={amb} toast={toast} />
      </div>

      <div className="dash-card">
        <div className="dash-card__title">{t('🏋️ Card de treino')}</div>
        <p className="profile-field__hint" style={{ margin: 0 }}>{t('Ao terminar um treino no modo aluno, toque em compartilhar: o card sai com o seu link e o seu QR. Cadastros por ele aparecem como "Card de treino" em Resultados.')}</p>
      </div>

      <div className="dash-card influencer-captions">
        <div className="dash-card__title">{t('✍️ Textos prontos')}</div>
        <p className="profile-field__hint" style={{ marginTop: 0 }}>{t('Copie, ajuste do seu jeito e poste. O link já vai junto.')}</p>
        {INFLUENCER_CAPTIONS.map(c => (
          <div className="influencer-caption" key={c.key}>
            <div className="amb__label">{c.label()}</div>
            <p className="influencer-caption__text">{captionText(amb.code, c)}</p>
            <button type="button" className="btn btn--outline btn--sm" disabled={!amb.active} onClick={() => handleCopy(c)}>{t('Copiar texto')}</button>
          </div>
        ))}
      </div>

      <PromoMaterialsCard toast={toast} />

      <div className="dash-card">
        <div className="dash-card__title">{t('💡 Dicas')}</div>
        <ul className="influencer-tips">
          <li>{t('Mostre o app em uso: um treino marcado ou a tela de evolução convence mais que um print da loja.')}</li>
          <li>{t('Deixe o link fixo na bio e lembre dele nos stories.')}</li>
          <li>{t('Use o link do canal certo: assim a aba Resultados mostra onde seu público mais se cadastra.')}</li>
        </ul>
      </div>
    </section>
  );
}
