import { useState } from 'react';
import bodyAnatomyImg from '../assets/anatomia.jpg';
import { MUSCLE_LABELS, FRONT_MUSCLE_PATHS, BACK_MUSCLE_PATHS, BODY_VIEW_SIZE } from '../data/bodyMuscleMap';

import { t } from '../lib/i18n';
// Busca a figura assim que o módulo carrega (junto com a página de Treino/Evolução),
// bem antes de o resumo do treino abrir: o modal já a encontra no cache do navegador.
if (typeof Image !== 'undefined') new Image().src = bodyAnatomyImg;

// Se a primeira tentativa falhar (rede instável), tenta de novo até 2 vezes em vez
// de deixar só as marcações dos músculos sobre um fundo vazio.
function AnatomyImg({ alt, className }) {
  const [attempt, setAttempt] = useState(0);
  const src = attempt === 0 ? bodyAnatomyImg : `${bodyAnatomyImg}?retry=${attempt}`;
  function handleError() {
    if (attempt < 2) setTimeout(() => setAttempt(n => n + 1), 800);
  }
  return <img key={attempt} src={src} alt={alt} className={className} decoding="sync" onError={handleError} />;
}

// levels: { músculo: 'none' | 'low' | 'ok' | 'high' } pinta por volume da
// semana (MuscleVolumeCard) em vez do liga/desliga de `active`.
function cls(active, muscle, levels) {
  if (levels) return `muscle muscle--lvl-${levels[muscle] || 'none'}`;
  return `muscle${active.has(muscle) ? ' muscle--active' : ''}`;
}

function Muscle({ active, levels, muscle, as: Tag, ...props }) {
  return (
    <Tag className={cls(active, muscle, levels)} data-muscle={muscle} {...props}>
      <title>{MUSCLE_LABELS[muscle]}</title>
    </Tag>
  );
}

function FrontView({ active, levels }) {
  return (
    <div className="body-avatar__view">
      <AnatomyImg alt={t('Frente')} className="body-avatar__img-bg body-avatar__img-bg--front" />
      <svg viewBox={`0 0 ${BODY_VIEW_SIZE.width} ${BODY_VIEW_SIZE.height}`} className="body-avatar__svg">
        {FRONT_MUSCLE_PATHS.map((p, i) => (
          <Muscle key={`${p.muscle}-${i}`} active={active} levels={levels} muscle={p.muscle} as="path" d={p.d} />
        ))}
      </svg>
    </div>
  );
}

function BackView({ active, levels }) {
  return (
    <div className="body-avatar__view">
      <AnatomyImg alt={t('Costas')} className="body-avatar__img-bg body-avatar__img-bg--back" />
      <svg viewBox={`0 0 ${BODY_VIEW_SIZE.width} ${BODY_VIEW_SIZE.height}`} className="body-avatar__svg">
        {BACK_MUSCLE_PATHS.map((p, i) => (
          <Muscle key={`${p.muscle}-${i}`} active={active} levels={levels} muscle={p.muscle} as="path" d={p.d} />
        ))}
      </svg>
    </div>
  );
}

export default function BodyAvatar({ activeGroups = new Set(), levels = null }) {
  return (
    <div className="body-avatar">
      <div className="body-avatar__figures">
        <div className="body-avatar__col">
          <FrontView active={activeGroups} levels={levels} />
          <span className="body-avatar__label">{t('Frente')}</span>
        </div>
        <div className="body-avatar__col">
          <BackView active={activeGroups} levels={levels} />
          <span className="body-avatar__label">{t('Costas')}</span>
        </div>
      </div>
      {levels ? (
        <div className="body-avatar__legend">
          <span className="body-avatar__legend-dot body-avatar__legend-dot--low" />
          <span>{t('Pouco')}</span>
          <span className="body-avatar__legend-dot body-avatar__legend-dot--ok" />
          <span>{t('Na faixa')}</span>
          <span className="body-avatar__legend-dot body-avatar__legend-dot--high" />
          <span>{t('Acima')}</span>
          <span className="body-avatar__legend-dot" />
          <span>{t('Nada')}</span>
        </div>
      ) : (
        <div className="body-avatar__legend">
          <span className="body-avatar__legend-dot body-avatar__legend-dot--active" />
          <span>{t('Trabalhado hoje')}</span>
          <span className="body-avatar__legend-dot" />
          <span>{t('Não trabalhado')}</span>
        </div>
      )}
    </div>
  );
}
