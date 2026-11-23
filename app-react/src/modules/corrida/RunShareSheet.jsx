import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../../lib/modalRoot';
import { useToast } from '../../context/useToast';
import { useBackToClose } from '../../hooks/useBackToClose';
import { renderRunCard, shareRunCard, canColorTrace } from './runShareCard';
import { t } from '../../lib/i18n';

// Escolha do cartão da corrida para os stories: com mapa ou só os números, o
// percurso pintado pelo ritmo ou pela subida, fundo escuro, mapa claro ou
// transparente (para pôr sobre a sua foto) e os selos de recorde. A prévia
// refaz o cartão a cada escolha. `run` é a corrida com kcal e selos (badges).
function Chips({ title, options, value, onChange }) {
  return (
    <div className="summary-section">
      <div className="summary-section__title">{title}</div>
      <div className="photo-share__toggles">
        {options.map(([key, label]) => (
          <button
            key={key} type="button" aria-pressed={value === key}
            className={`btn btn--sm ${value === key ? 'btn--primary' : 'btn--outline'}`}
            onClick={() => onChange(key)}
          >{label}</button>
        ))}
      </div>
    </div>
  );
}

export default function RunShareSheet({ run, onClose, onPhoto }) {
  useBackToClose(onClose);
  const toast = useToast();
  const hasRoute = Array.isArray(run.route) && run.route.length > 0;
  const [format, setFormat] = useState('story');
  const [style, setStyle] = useState(hasRoute ? 'mapa' : 'numeros');
  const [trace, setTrace] = useState('laranja');
  const [bg, setBg] = useState('escuro');
  const [withBadges, setWithBadges] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [sharing, setSharing] = useState(false);
  const blobRef = useRef(null);
  const badges = useMemo(() => run.badges || [], [run.badges]);
  const map = style === 'mapa';

  const traces = useMemo(() => [
    ['laranja', t('Laranja')],
    canColorTrace(run, 'ritmo') && ['ritmo', t('Pelo ritmo')],
    canColorTrace(run, 'elevacao') && ['elevacao', t('Pela subida')],
  ].filter(Boolean), [run]);

  const square = format === 'quadrado';
  const opts = useMemo(() => ({
    format,
    style,
    trace: map ? trace : 'laranja',
    bg: square && bg === 'transparente' ? 'escuro' : (map || bg === 'transparente' ? bg : 'escuro'),
    badges: withBadges ? badges : [],
  }), [format, square, style, trace, bg, map, withBadges, badges]);

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  // Redesenha a cada escolha; o blob fica pronto antes do toque em compartilhar
  // (o share nativo precisa do gesto ainda ativo).
  useEffect(() => {
    let active = true;
    let url = '';
    setBusy(true);
    renderRunCard(run, undefined, opts)
      .then(blob => {
        if (!active || !blob) return;
        blobRef.current = blob;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch(err => { console.error('RunShareSheet render:', err); toast(t('⚠️ Erro ao gerar imagem de compartilhamento')); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [run, opts, toast]);

  async function handleShare() {
    if (!blobRef.current || sharing) return;
    setSharing(true);
    try {
      const result = await shareRunCard(run, blobRef.current, opts);
      if (result === 'downloaded') toast(t('🖼️ Imagem baixada'));
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('RunShareSheet share:', err);
        toast(t('⚠️ Erro ao gerar imagem de compartilhamento'));
      }
    } finally {
      setSharing(false);
    }
  }

  return createPortal(
    <div className="summary-modal" role="dialog" aria-modal="true" aria-label={t('Personalizar o cartão da corrida')}>
      <div className="summary-modal__backdrop" onClick={onClose} />
      <div className="summary-modal__panel">
        <div className="summary-modal__header">
          <div>
            <h2 className="summary-modal__title">{t('🎨 Cartão da corrida')}</h2>
            <p className="summary-modal__subtitle">{t('Escolha o estilo e compartilhe nos stories')}</p>
          </div>
          <button type="button" className="summary-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>

        <div className="summary-modal__body">
          {previewUrl && <img className="photo-share__preview" style={square ? { aspectRatio: '1 / 1' } : undefined} src={previewUrl} alt={t('Prévia do cartão da corrida')} />}
          {busy && <p className="card-note" role="status">{t('Gerando imagem…')}</p>}

          <Chips
            title={t('Formato')} value={format} onChange={setFormat}
            options={[['story', t('📱 Stories (9:16)')], ['quadrado', t('⬜ Post (1:1)')]]}
          />
          {hasRoute && (
            <Chips
              title={t('Estilo')} value={style} onChange={setStyle}
              options={[['mapa', t('🗺️ Mapa')], ['numeros', t('🔢 Só números')]]}
            />
          )}
          {map && traces.length > 1 && (
            <Chips title={t('Cor do percurso')} value={trace} onChange={setTrace} options={traces} />
          )}
          <Chips
            title={t('Fundo')} value={opts.bg} onChange={setBg}
            options={[
              ['escuro', t('Escuro')],
              map && ['claro', t('Mapa claro')],
              !square && ['transparente', t('Transparente')],
            ].filter(Boolean)}
          />
          {opts.bg === 'transparente' && <p className="card-note">{t('Imagem sem fundo: use por cima de uma foto nos stories.')}</p>}
          {badges.length > 0 && (
            <div className="summary-section">
              <div className="summary-section__title">{t('Selos')}</div>
              <div className="photo-share__toggles">
                <button
                  type="button" aria-pressed={withBadges}
                  className={`btn btn--sm ${withBadges ? 'btn--primary' : 'btn--outline'}`}
                  onClick={() => setWithBadges(v => !v)}
                >{t('🏆 Recordes e conquistas')}</button>
              </div>
            </div>
          )}
        </div>

        <div className="summary-modal__footer">
          <button type="button" className="btn btn--primary btn--full" disabled={!previewUrl || busy || sharing} onClick={handleShare}>
            {sharing ? t('Gerando imagem…') : t('📤 Compartilhar')}
          </button>
          {onPhoto && (
            <button type="button" className="btn btn--outline btn--full" onClick={onPhoto}>{t('📸 Usar uma foto minha')}</button>
          )}
          <button type="button" className="btn btn--outline btn--full" onClick={onClose}>{t('Fechar')}</button>
        </div>
      </div>
    </div>,
    getModalRoot()
  );
}
