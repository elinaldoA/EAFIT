import { TIKTOK_PRIVACY_LABEL, tiktokLabel } from '../lib/marketing';

const MUSIC_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const BRANDED_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

// Marketing → Publicar, com o TikTok marcado: o que as regras de
// compartilhamento do TikTok pedem antes de postar (conta que posta, quem pode
// ver sem padrão, interações, divulgação comercial, prévia e declaração).
export default function MarketingTikTokOptions({ creator, publicPosts, error, value, onChange, video, onDuration }) {
  const set = patch => onChange({ ...value, ...patch });

  if (error) return <p className="form-msg form-msg--error">TikTok: {error}</p>;
  if (!creator) return <p className="user-detail__meta">Carregando a conta do TikTok…</p>;

  const interactions = [
    { key: 'allow_comment', label: 'Comentários', off: creator.commentDisabled },
    { key: 'allow_duet', label: 'Dueto', off: creator.duetDisabled },
    { key: 'allow_stitch', label: 'Costura', off: creator.stitchDisabled },
  ];
  const label = tiktokLabel(value);

  return (
    <fieldset className="mkt-tiktok stack">
      <legend className="field__label">TikTok</legend>

      <div className="mkt-tiktok__creator">
        {creator.avatarUrl && <img src={creator.avatarUrl} alt="" className="mkt-tiktok__avatar" />}
        <span>Publicando como <strong>{creator.nickname || creator.username}</strong>{creator.username ? ` (@${creator.username})` : ''}</span>
      </div>

      {video && (
        <video src={video.url} controls muted playsInline preload="metadata" className="mkt-tiktok__preview"
          onLoadedMetadata={e => onDuration(e.currentTarget.duration)} />
      )}
      {creator.maxDurationSec > 0 && <p className="user-detail__meta">Esta conta aceita vídeos de até {creator.maxDurationSec} segundos.</p>}

      <label className="field">
        <span className="field__label">Quem pode ver este vídeo</span>
        <select className="input" value={value.privacy_level} onChange={e => set({ privacy_level: e.target.value })}>
          <option value="" disabled>Escolha</option>
          {creator.privacyOptions.map(o => (
            <option key={o} value={o} disabled={o === 'SELF_ONLY' && value.commercial && value.brand_content}
              title={o === 'SELF_ONLY' && value.commercial && value.brand_content ? 'Conteúdo de marca não pode ficar privado' : ''}>
              {TIKTOK_PRIVACY_LABEL[o] || o}
            </option>
          ))}
        </select>
      </label>
      {!publicPosts && (
        <p className="user-detail__meta">
          Enquanto o app não for auditado pelo TikTok, o vídeo sai como “Somente eu”: depois, mude a visibilidade no próprio TikTok.
        </p>
      )}

      <div className="field">
        <span className="field__label">Permitir</span>
        <div className="actions-row">
          {interactions.map(i => (
            <label key={i.key} title={i.off ? 'Desativado nas configurações da conta do TikTok' : ''} className={i.off ? 'mkt-tiktok__off' : ''}>
              <input type="checkbox" checked={!i.off && value[i.key]} disabled={i.off} onChange={e => set({ [i.key]: e.target.checked })} /> {i.label}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label>
          <input type="checkbox" checked={value.commercial}
            onChange={e => set({ commercial: e.target.checked, ...(e.target.checked ? {} : { brand_organic: false, brand_content: false }) })} />
          {' '}Divulgar conteúdo comercial
        </label>
        <p className="user-detail__meta">Ligue se o vídeo promove você, uma marca, um produto ou um serviço.</p>
        {value.commercial && (
          <div className="stack mkt-tiktok__brand">
            <label>
              <input type="checkbox" checked={value.brand_organic} onChange={e => set({ brand_organic: e.target.checked })} /> Sua marca
              <span className="user-detail__meta"> · você está promovendo a si mesmo ou o seu negócio</span>
            </label>
            <label title={value.privacy_level === 'SELF_ONLY' ? 'Conteúdo de marca não pode ficar como “Somente eu”' : ''}>
              <input type="checkbox" checked={value.brand_content} disabled={value.privacy_level === 'SELF_ONLY'}
                onChange={e => set({ brand_content: e.target.checked })} /> Conteúdo de marca
              <span className="user-detail__meta"> · você está promovendo outra marca ou um terceiro</span>
            </label>
            {label && <p className="user-detail__meta">{label}</p>}
          </div>
        )}
      </div>

      <p className="user-detail__meta">
        Ao publicar, você concorda com{' '}
        {value.commercial && value.brand_content && (
          <><a href={BRANDED_URL} target="_blank" rel="noreferrer">a Política de Conteúdo de Marca</a> e </>
        )}
        <a href={MUSIC_URL} target="_blank" rel="noreferrer">a Confirmação de Uso de Música</a> do TikTok.
        {' '}Depois de enviado, o vídeo pode levar alguns minutos para aparecer no perfil.
      </p>
    </fieldset>
  );
}
