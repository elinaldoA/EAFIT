import { PLATFORMS, countHashtags } from '../../lib/marketing';
import MarketingTikTokOptions from '../MarketingTikTokOptions';
import MediaPicker from './MediaPicker';

export default function StepContent({
  story, caption, setCaption, platforms, text, media, tiktokAccount, tiktokReady, tiktokInfo, tiktok, setTiktok, setVideoDuration, picker,
}) {
  return (
        <section className="card mkt-step">
          <h2 className="mkt-step__title"><span className="mkt-step__n">2</span> Conteúdo</h2>
        {story ? (
          <p className="user-detail__meta">
            Story não tem legenda: o texto vai na própria arte. Use imagem ou vídeo em pé (9:16, como as artes “Story ·” e os
            Reels da biblioteca); vídeo de story no Instagram vai até 60 segundos.
          </p>
        ) : (
          <>
            <label className="field">
              <span className="field__label">Legenda</span>
              <textarea className="input" rows={6} value={caption} maxLength={5000} onChange={e => setCaption(e.target.value)}
                placeholder="Conte a novidade, chame para baixar: eafit.com.br/app  #treino #academia" />
            </label>
            <div className="mkt-counters">
              {platforms.map(p => (
                <span key={p} className={text.length > PLATFORMS[p].limit ? 'mkt-over' : ''}>
                  {PLATFORMS[p].label}: {text.length}/{PLATFORMS[p].limit}
                </span>
              ))}
              {platforms.includes('instagram') && <span className={countHashtags(text) > 30 ? 'mkt-over' : ''}>hashtags: {countHashtags(text)}/30</span>}
            </div>
          </>
        )}

      <MediaPicker media={media} story={story} {...picker} />

        {tiktokAccount && (
          <MarketingTikTokOptions
            creator={tiktokReady ? tiktokInfo.creator : null} publicPosts={tiktokReady ? tiktokInfo.publicPosts : true}
            error={tiktokReady ? tiktokInfo.error : ''} value={tiktok} onChange={setTiktok}
            video={media.length === 1 && media[0].type === 'video' ? media[0] : null} onDuration={setVideoDuration} />
        )}

        {text && (
          <div className="field">
            <span className="field__label">Como vai sair</span>
            <pre className="mkt-preview">{text}</pre>
          </div>
        )}
        </section>
  );
}
