import { t } from '../lib/i18n';
// Tela cheia exibida quando o admin liga o modo manutenção no painel.
// Reaproveita as classes da splash (.boot) pra herdar o visual do app.
export default function MaintenanceScreen({ message }) {
  return (
    <div className="boot maintenance" role="status">
      <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />
      <div className="boot__name">EAFIT</div>
      <h1 className="maintenance__title">{t('Voltamos em instantes')}</h1>
      <p className="maintenance__text">
        {message || t('Estamos fazendo uma manutenção rápida para deixar o app ainda melhor.')}
      </p>
      <button type="button" className="btn btn--outline btn--sm" onClick={() => window.location.reload()}>
        {t('Tentar novamente')}
      </button>
    </div>
  );
}
