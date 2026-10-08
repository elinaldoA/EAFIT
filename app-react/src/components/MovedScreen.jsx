import { t } from '../lib/i18n';
// Tela cheia exibida no endereço antigo quando o admin liga a mudança de
// endereço no painel: o app instalado ali não recebe mais atualização, então
// bloqueia e manda pro novo. Reaproveita as classes da splash (.boot).
export default function MovedScreen({ url }) {
  return (
    <div className="boot maintenance" role="status">
      <img src={`${import.meta.env.BASE_URL}icon-maskable-192.png`} alt="" />
      <div className="boot__name">EAFIT</div>
      <h1 className="maintenance__title">{t('O EAFIT mudou de endereço')}</h1>
      <p className="maintenance__text">
        {t('Esta versão não recebe mais atualizações. Abra o novo endereço, entre com o mesmo e-mail e senha e instale o app de novo.')}
      </p>
      <p className="maintenance__text">{t('Seus treinos e dados continuam salvos na sua conta.')}</p>
      <a className="btn btn--primary" href={url} target="_blank" rel="noopener noreferrer">
        {t('Abrir o novo endereço')}
      </a>
    </div>
  );
}
