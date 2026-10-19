import { setSeasonOff } from '../lib/season';
import { SEASON_DECOR_LABEL } from '../lib/seasonLabels';

import { t } from '../lib/i18n';
// Liga/desliga a decoração do tema de temporada neste aparelho (lib/season.js).
// A conquista do período continua valendo com a decoração desligada.
export default function ProfileSeasonSection({ theme, off }) {
  return (
    <>
      <div className="profile-field profile-field--row">
        <label className="profile-field__label" htmlFor="seasonDecor">{SEASON_DECOR_LABEL[theme]()}</label>
        <input type="checkbox" id="seasonDecor" checked={!off} onChange={e => setSeasonOff(theme, !e.target.checked)} />
      </div>
      <span className="profile-field__hint">{t('Cores, ícones, emojis, fundo e efeitos do app inteiro, faixa do tema, card de compartilhar e falas do treinador. Vale só para este aparelho e some sozinha depois do período.')}</span>
    </>
  );
}
