import { useState } from 'react';
import { BODIES, DEFAULT_HERO, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKIN, sanitizeHero } from '../lib/hero';
import { t } from '../lib/i18n';
import HeroAvatar from './HeroAvatar';

function Swatches({ label, colors, value, onChange, names }) {
  return (
    <div className="hero-creator__row">
      <span className="friends__label">{label}</span>
      <div className="hero-creator__options" role="group" aria-label={label}>
        {colors.map((color, i) => (
          <button key={color} type="button" className="hero-creator__swatch" style={{ background: color }}
            aria-pressed={value === i + 1} aria-label={`${label} ${i + 1}${names ? ` ${names[i]}` : ''}`}
            onClick={() => onChange(i + 1)} />
        ))}
      </div>
    </div>
  );
}

// Criação e edição do herói: o desenho ao vivo e as opções de corpo, pele,
// cabelo e cor da roupa. O equipamento não se escolhe: ele vem do nível.
export default function HeroCreator({ initial, level = 1, form, saving, onSave, onCancel }) {
  const [hero, setHero] = useState(() => sanitizeHero(initial || DEFAULT_HERO));
  const set = key => value => setHero(prev => ({ ...prev, [key]: value }));
  const bodyNames = [t('Esguio'), t('Médio'), t('Forte')];

  return (
    <div className="dash-card hero-creator">
      <div className="dash-card__title">{initial ? t('✏️ Editar herói') : t('✨ Crie seu herói')}</div>
      <div className="hero-creator__preview">
        <HeroAvatar hero={hero} level={level} form={form?.form} goal={form?.goal} mood="idle" label={t('Prévia do herói')} />
      </div>

      <div className="hero-creator__row">
        <span className="friends__label">{t('Corpo')}</span>
        <div className="hero-creator__options" role="group" aria-label={t('Corpo')}>
          {BODIES.map(b => (
            <button key={b} type="button" aria-pressed={hero.body === b}
              className={`btn btn--sm ${hero.body === b ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => set('body')(b)}>{bodyNames[b - 1]}</button>
          ))}
        </div>
      </div>

      <Swatches label={t('Pele')} colors={SKIN} value={hero.skin} onChange={set('skin')} />

      <div className="hero-creator__row">
        <span className="friends__label">{t('Cabelo')}</span>
        <div className="hero-creator__options" role="group" aria-label={t('Cabelo')}>
          {HAIR_STYLES.map(s => (
            <button key={s} type="button" className="hero-creator__style" aria-pressed={hero.hair_style === s}
              aria-label={t('Estilo de cabelo {n}', { n: s })} onClick={() => set('hair_style')(s)}>
              <HeroAvatar hero={{ ...hero, hair_style: s }} level={1} mood="still" crop="head" label="" />
            </button>
          ))}
        </div>
      </div>

      <Swatches label={t('Cor do cabelo')} colors={HAIR_COLORS} value={hero.hair_color} onChange={set('hair_color')} />
      <Swatches label={t('Cor da roupa')} colors={OUTFITS} value={hero.outfit} onChange={set('outfit')} />

      <p className="challenge__meta">
        {t('O equipamento evolui sozinho com o seu nível: faixa, cinto, ombreiras, capa e aura.')}
      </p>
      <div className="challenge__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={() => onSave(hero)}>
          {saving ? t('Salvando…') : t('Salvar herói')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={onCancel}>
          {t('Cancelar')}
        </button>
      </div>
    </div>
  );
}
