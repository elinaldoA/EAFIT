import { useEffect, useState } from 'react';
import { fetchMyActiveProgram, fetchProgram, pendingProgramInvite, clearProgramInvite, accentOf } from '../lib/influencers';
import { InfluencerAvatar } from './ProgramsModal';

import { t } from '../lib/i18n';
// Marca do influenciador no Treino: quando o plano ativo veio de um programa,
// o card com a foto, a cor e o nome dele (tocar abre a página). `planKey` muda
// quando o plano é trocado, para reconsultar.
export function InfluencerProgramBanner({ planKey, onOpen }) {
  const [program, setProgram] = useState(null);

  useEffect(() => {
    let active = true;
    fetchMyActiveProgram().then(p => { if (active) setProgram(p); }).catch(() => { if (active) setProgram(null); });
    return () => { active = false; };
  }, [planKey]);

  if (!program?.influencer) return null;
  const inf = program.influencer;
  const accent = accentOf(inf);
  return (
    <button
      type="button" className="inf-banner" style={accent ? { '--inf-accent': accent } : undefined}
      onClick={() => onOpen({ code: inf.code })}
    >
      <InfluencerAvatar influencer={inf} size={40} />
      <span className="inf-banner__text">
        <span className="inf-banner__kicker">{t('Programa de {name}', { name: inf.name })}</span>
        <strong className="inf-banner__name">{program.name}</strong>
      </span>
      <span className="inf-banner__go" aria-hidden="true">›</span>
    </button>
  );
}

// Convite guardado pelo link ?programa= (lib/influencers.js): aparece no Treino
// depois do cadastro/onboarding. "Ver programa" abre a vitrine nele; "Agora
// não" descarta. Programa que saiu do ar é descartado em silêncio.
export function ProgramInvite({ onOpen }) {
  const [program, setProgram] = useState(null);

  useEffect(() => {
    const id = pendingProgramInvite();
    if (!id) return;
    let active = true;
    fetchProgram(id)
      .then(p => { if (!active) return; if (p) setProgram({ ...p, id }); else clearProgramInvite(); })
      .catch(() => { /* tenta de novo na próxima abertura */ });
    return () => { active = false; };
  }, []);

  if (!program) return null;
  const inf = program.influencer;
  const accent = accentOf(inf);
  return (
    <div className="inf-invite" role="region" aria-label={t('Convite para um programa')} style={accent ? { '--inf-accent': accent } : undefined}>
      <InfluencerAvatar influencer={inf} size={44} />
      <div className="inf-invite__text">
        <span className="inf-banner__kicker">{t('{name} te convidou', { name: inf.name })}</span>
        <strong className="inf-banner__name">{program.name}</strong>
      </div>
      <div className="inf-invite__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => { clearProgramInvite(); setProgram(null); onOpen({ programId: program.id }); }}>
          {t('Ver programa')}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { clearProgramInvite(); setProgram(null); }}>
          {t('Agora não')}
        </button>
      </div>
    </div>
  );
}
