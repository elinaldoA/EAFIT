import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getModalRoot } from '../lib/modalRoot';
import { useBackToClose } from '../hooks/useBackToClose';
import { useWorkout } from '../context/useWorkout';
import { trackFeature } from '../lib/tracking';
import {
  fetchDirectory, fetchInfluencer, fetchProgram, setFollowing, adoptProgram, levelLabel, accentOf, plural, friendlyInfluencerError,
} from '../lib/influencers';
import Loading from './Loading';

import { t, tEx, tReps } from '../lib/i18n';
// Vitrine de programas dos influenciadores (Treino → 🌟 Programas): lista de
// influenciadores → página dele → programa com os dias → "Começar". Começar
// troca o plano ativo (o anterior fica salvo em "Editar treino") e já segue.
// initial: { code } abre direto na página do influenciador; { programId } no programa.
export default function ProgramsModal({ initial = null, toast, onClose }) {
  useBackToClose(onClose);
  const [view, setView] = useState(() => (initial?.programId ? { program: initial.programId } : initial?.code ? { code: initial.code } : {}));

  useEffect(() => {
    trackFeature('influencer_programs');
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  let body;
  if (view.program) {
    body = <ProgramView id={view.program} toast={toast} onDone={onClose} onInfluencer={code => setView({ code })} />;
  } else if (view.code) {
    body = <InfluencerView code={view.code} toast={toast} onProgram={id => setView({ code: view.code, program: id })} />;
  } else {
    body = <DirectoryView toast={toast} onOpen={code => setView({ code })} />;
  }
  const back = view.program && view.code ? { code: view.code } : view.code && !initial?.code ? {} : null;

  return createPortal(
    <div className="plan-modal" role="dialog" aria-modal="true" aria-labelledby="programsTitle">
      <div className="plan-modal__backdrop" onClick={onClose} />
      <div className="plan-modal__panel">
        <div className="plan-modal__header">
          {back && <button type="button" className="link-btn" onClick={() => setView(back)}>{t('‹ Voltar')}</button>}
          <h2 className="plan-modal__title" id="programsTitle">{t('🌟 Programas')}</h2>
          <button type="button" className="plan-modal__close" aria-label={t('Fechar')} onClick={onClose}>✕</button>
        </div>
        <div className="plan-modal__body">{body}</div>
      </div>
    </div>,
    getModalRoot()
  );
}

// Carrega de novo quando `key` muda (o código do influenciador, o id do programa).
function useLoad(fn, key) {
  const [state, setState] = useState({ loading: true, data: null, error: false });
  useEffect(() => {
    let active = true;
    setState({ loading: true, data: null, error: false });
    fn().then(data => { if (active) setState({ loading: false, data, error: false }); })
      .catch(() => { if (active) setState({ loading: false, data: null, error: true }); });
    return () => { active = false; };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function InfluencerAvatar({ influencer, size = 48 }) {
  const accent = accentOf(influencer);
  return influencer.avatar ? (
    <img className="inf-avatar" src={influencer.avatar} alt="" width={size} height={size} style={accent ? { borderColor: accent } : undefined} />
  ) : (
    <span className="inf-avatar inf-avatar--initial" style={{ width: size, height: size, ...(accent && { borderColor: accent, color: accent }) }} aria-hidden="true">
      {(influencer.name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

function FollowButton({ influencer, toast }) {
  const [following, setFollowingState] = useState(!!influencer.following);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await setFollowing(influencer.code, !following);
      setFollowingState(!following);
      toast(following ? t('Você deixou de seguir {name}', { name: influencer.name }) : t('✅ Seguindo {name}', { name: influencer.name }));
    } catch (err) {
      toast(`⚠️ ${friendlyInfluencerError(err)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className={`btn btn--sm ${following ? 'btn--ghost' : 'btn--outline'}`} disabled={busy} aria-pressed={following} onClick={toggle}>
      {following ? t('Seguindo') : t('Seguir')}
    </button>
  );
}

function DirectoryView({ toast, onOpen }) {
  const { loading, data, error } = useLoad(fetchDirectory, 'directory');
  if (loading) return <Loading />;
  if (error) return <p className="dash-empty">{t('Não foi possível carregar os programas agora.')}</p>;
  if (!data.length) return <p className="dash-empty">{t('Em breve: programas de treino montados por influenciadores parceiros do EAFIT.')}</p>;
  return (
    <ul className="inf-list">
      {data.map(inf => (
        <li key={inf.code} className="inf-card" style={accentOf(inf) ? { '--inf-accent': accentOf(inf) } : undefined}>
          <button type="button" className="inf-card__main" onClick={() => onOpen(inf.code)}>
            <InfluencerAvatar influencer={inf} />
            <span className="inf-card__text">
              <strong>{inf.name}</strong>
              <span className="inf-card__meta">@{inf.code} · {plural(inf.programs, '1 programa', '{n} programas')} · {plural(inf.followers, '1 seguidor', '{n} seguidores')}</span>
              {inf.bio && <span className="inf-card__bio">{inf.bio}</span>}
            </span>
          </button>
          <FollowButton influencer={inf} toast={toast} />
        </li>
      ))}
    </ul>
  );
}

function InfluencerView({ code, toast, onProgram }) {
  const { loading, data, error } = useLoad(async () => {
    const [profile, dir] = await Promise.all([fetchInfluencer(code), fetchDirectory().catch(() => [])]);
    return profile && { ...profile, following: dir.find(d => d.code === profile.code)?.following };
  }, code);
  if (loading) return <Loading />;
  if (error || !data) return <p className="dash-empty">{t('Este influenciador não está mais no EAFIT.')}</p>;
  const accent = accentOf(data);
  return (
    <div className="inf-page" style={accent ? { '--inf-accent': accent } : undefined}>
      <div className="inf-page__head">
        <InfluencerAvatar influencer={data} size={72} />
        <div className="inf-page__who">
          <strong className="inf-page__name">{data.name}</strong>
          <span className="inf-card__meta">@{data.code} · {plural(data.followers, '1 seguidor', '{n} seguidores')}</span>
          {data.instagram && (
            <a className="inf-page__ig" href={`https://instagram.com/${data.instagram}`} target="_blank" rel="noopener noreferrer">Instagram @{data.instagram}</a>
          )}
        </div>
        <FollowButton influencer={data} toast={toast} />
      </div>
      {data.bio && <p className="inf-page__bio">{data.bio}</p>}
      <div className="plan-editor__section-title">{t('Programas')}</div>
      {data.programs.length === 0 && <p className="dash-empty">{t('Nenhum programa no ar agora.')}</p>}
      <ul className="inf-list">
        {data.programs.map(p => (
          <li key={p.id}>
            <button type="button" className="inf-program-card" onClick={() => onProgram(p.id)}>
              <strong>{p.name}</strong>
              <span className="inf-card__meta">
                {levelLabel(p.level)} · {plural(p.days, '1 dia por semana', '{n} dias por semana')}{p.weeks ? ` · ${plural(p.weeks, '1 semana', '{n} semanas')}` : ''}
              </span>
              {p.description && <span className="inf-card__bio">{p.description}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProgramView({ id, toast, onDone, onInfluencer }) {
  const { refreshPlan } = useWorkout();
  const { loading, data, error } = useLoad(() => fetchProgram(id), id);
  const [adopting, setAdopting] = useState(false);
  if (loading) return <Loading />;
  if (error || !data) return <p className="dash-empty">{t('Este programa saiu do ar.')}</p>;
  const inf = data.influencer;
  const accent = accentOf(inf);

  async function handleAdopt() {
    if (!window.confirm(t('Começar "{name}"? Ele vira o seu treino agora; o plano atual fica salvo em Editar treino.', { name: data.name }))) return;
    setAdopting(true);
    try {
      await adoptProgram(id);
      await refreshPlan();
      toast(t('🚀 Programa "{name}" ativado!', { name: data.name }));
      onDone();
    } catch (err) {
      toast(`⚠️ ${friendlyInfluencerError(err)}`);
      setAdopting(false);
    }
  }

  return (
    <div className="inf-page" style={accent ? { '--inf-accent': accent } : undefined}>
      <button type="button" className="inf-page__by" onClick={() => onInfluencer(inf.code)}>
        <InfluencerAvatar influencer={inf} size={32} />
        <span>{t('por {name}', { name: inf.name })}</span>
      </button>
      <h3 className="inf-page__title">{data.name}</h3>
      <span className="inf-card__meta">
        {levelLabel(data.level)} · {plural(data.days, '1 dia por semana', '{n} dias por semana')}{data.weeks ? ` · ${plural(data.weeks, '1 semana', '{n} semanas')}` : ''} · {plural(data.exercises, '1 exercício', '{n} exercícios')}
      </span>
      {data.description && <p className="inf-page__bio">{data.description}</p>}

      <button type="button" className="btn btn--primary btn--full inf-page__cta" disabled={adopting} onClick={handleAdopt}>
        {adopting ? t('Ativando…') : t('🚀 Começar este programa')}
      </button>

      {data.plan.map(day => (
        <div className="inf-day" key={day.dia}>
          <div className="inf-day__title">{t(day.dia)}{day.foco ? ` · ${day.foco}` : ''}</div>
          <ul className="inf-day__list">
            {day.exercicios.map((ex, i) => (
              <li key={i}>
                <span>{ex.grupo ? <span className="inf-day__group">{ex.grupo}</span> : null}{tEx(ex.nome)}</span>
                <span className="inf-card__meta">{ex.series} × {tReps(ex.reps)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
