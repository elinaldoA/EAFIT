import { Paged } from '../ShowMore';
import { Link } from 'react-router-dom';

export default function MediaPicker({ media, story, pickerTab, setPickerTab, library, pickerItems, videoQuery, setVideoQuery, toggleMedia }) {
  return (
    <div className="field">
      <span className="field__label">
        Mídia ({media.length} escolhida{media.length === 1 ? '' : 's'}: {story ? '1 imagem ou 1 vídeo' : 'até 10 imagens ou 1 vídeo'})
      </span>
      {media.length > 0 && (
        <div className="mkt-chips">
          {media.map(m => (
            <button key={m.url} type="button" className="mkt-chip mkt-chip--on" onClick={() => toggleMedia(m)} aria-label={`Tirar ${m.label}`}>
              {m.type === 'video' ? '🎬' : '🖼️'} {m.label} ✕
            </button>
          ))}
        </div>
      )}
      <div className="actions-row">
        <button type="button" className={`btn btn--small${pickerTab === 'library' ? '' : ' btn--ghost'}`} onClick={() => setPickerTab('library')}>Minhas mídias ({library.length})</button>
        <button type="button" className={`btn btn--small${pickerTab === 'videos' ? '' : ' btn--ghost'}`} onClick={() => setPickerTab('videos')}>Vídeos de exercício</button>
        {pickerTab === 'videos' && <input className="input search-input" placeholder="Buscar exercício" aria-label="Buscar exercício" value={videoQuery} onChange={e => setVideoQuery(e.target.value)} />}
        <Link to="/marketing-midia" className="user-detail__meta">Criar arte com print do app →</Link>
      </div>
      {pickerItems.length === 0
        ? <p className="user-detail__meta">Nada na biblioteca ainda. Crie artes com os prints em Biblioteca de mídia.</p>
        : (
          <Paged items={pickerItems} size={24} resetKey={`${pickerTab}|${videoQuery}`}>{visible => (
          <div className="mkt-grid mkt-grid--picker">
            {visible.map(item => {
              const on = media.some(m => m.url === item.url);
              return (
                <button key={item.key} type="button" className={`mkt-tile mkt-pick${on ? ' mkt-tile--active' : ''}`} onClick={() => toggleMedia(item)} aria-pressed={on}>
                  {item.type === 'video'
                    ? <video src={item.url} muted playsInline preload="none" className="mkt-tile__media" />
                    : <img src={item.url} alt="" loading="lazy" className="mkt-tile__media" />}
                  <span className="mkt-pick__label">{item.label}</span>
                </button>
              );
            })}
          </div>
          )}</Paged>
        )}
    </div>
  );
}
