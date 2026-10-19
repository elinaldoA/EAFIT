import { useCallback, useEffect, useState } from 'react';
import CollapsibleCard from './CollapsibleCard';
import InfluencerProgramEditor from './InfluencerProgramEditor';
import {
  fetchMyInfluencer, saveInfluencerProfile, submitProgram, setProgramHidden, deleteProgram,
  programStatus, levelLabel, plural, influencerPageUrl, programAppUrl, shareLink, friendlyInfluencerError,
} from '../lib/influencers';

import { t } from '../lib/i18n';
// Perfil → Influenciador: só aparece para embaixador promovido a influenciador.
// A página pública (foto do perfil do app, bio, Instagram, cor) e os programas
// — rascunho, revisão da equipe e o que está no ar. Como o embaixador, vê só
// números (seguidores, quem começou cada programa), nunca quem são.
export default function ProfileInfluencerSection({ toast }) {
  const [me, setMe] = useState(null);

  const load = useCallback(() => fetchMyInfluencer().then(setMe).catch(() => { /* sem área */ }), []);
  useEffect(() => { load(); }, [load]);

  if (!me) return null;
  const live = me.programs.filter(p => p.live && !p.hidden).length;

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Influenciador EAFIT')}</div>
      <CollapsibleCard
        icon="🌟" title={t('Minha página')}
        summary={`${plural(me.followers, '1 seguidor', '{n} seguidores')} · @${me.code}`}
      >
        <InfluencerProfileForm me={me} toast={toast} onSaved={load} />
      </CollapsibleCard>
      <CollapsibleCard
        icon="🎬" title={t('Meus programas')}
        summary={t('{live} no ar · {total} no total', { live, total: me.programs.length })}
      >
        <InfluencerPrograms me={me} toast={toast} onChanged={load} />
      </CollapsibleCard>
    </div>
  );
}

function InfluencerProfileForm({ me, toast, onSaved }) {
  const [bio, setBio] = useState(me.bio || '');
  const [instagram, setInstagram] = useState(me.instagram || '');
  const [accent, setAccent] = useState(me.accent || '#f97316');
  const [saving, setSaving] = useState(false);
  const url = influencerPageUrl(me.code);

  async function handleSave() {
    setSaving(true);
    try {
      await saveInfluencerProfile({ bio, instagram, accent });
      toast(t('✅ Página atualizada'));
      onSaved();
    } catch (err) {
      toast(`⚠️ ${friendlyInfluencerError(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    const result = await shareLink(url, t('Meus treinos estão no EAFIT. Escolhe um programa e treina comigo! 💪'));
    if (result === 'copied') toast(t('🔗 Link copiado'));
    else if (result === 'failed') toast(t('⚠️ Não deu pra compartilhar. Copie o link acima'));
  }

  return (
    <div className="inf">
      <div className="amb__link">
        <span className="amb__link-label">{t('Sua página')}</span>
        <code className="amb__link-url">{url}</code>
        <button type="button" className="btn btn--outline btn--sm" onClick={handleShare}>{t('Compartilhar')}</button>
      </div>
      <p className="amb__hint">{t('A foto é a mesma do seu perfil no app. Quem abre a página e cria conta entra como cadastro seu, como no link de embaixador.')}</p>

      <div className="profile-field">
        <label className="profile-field__label" htmlFor="infBio">{t('Bio')}</label>
        <textarea id="infBio" className="input input--sm" rows={3} maxLength={280}
          placeholder={t('Quem é você e como você treina')} value={bio} onChange={e => setBio(e.target.value)} />
        <span className="profile-field__hint">{bio.length}/280</span>
      </div>
      <div className="inf-editor__row">
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="infIg">Instagram</label>
          <input id="infIg" className="input input--sm" placeholder="@seuperfil" maxLength={31}
            value={instagram} onChange={e => setInstagram(e.target.value)} />
        </div>
        <div className="profile-field">
          <label className="profile-field__label" htmlFor="infAccent">{t('Cor da página')}</label>
          <input id="infAccent" className="input input--sm inf__color" type="color" value={accent} onChange={e => setAccent(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={handleSave}>
        {saving ? t('Salvando…') : t('Salvar página')}
      </button>
    </div>
  );
}

function InfluencerPrograms({ me, toast, onChanged }) {
  const [editing, setEditing] = useState(undefined); // undefined = fechado, null = novo
  const [busy, setBusy] = useState(null);

  async function run(id, fn, okMsg) {
    setBusy(id);
    try {
      await fn();
      if (okMsg) toast(okMsg);
      await onChanged();
    } catch (err) {
      toast(`⚠️ ${friendlyInfluencerError(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleShare(p) {
    const result = await shareLink(programAppUrl(me.code, p.id), t('Bora treinar comigo? Começa o meu programa "{name}" no EAFIT 💪', { name: p.draft.name }));
    if (result === 'copied') toast(t('🔗 Link copiado'));
    else if (result === 'failed') toast(t('⚠️ Não deu pra compartilhar o link'));
  }

  return (
    <div className="inf">
      <p className="amb__hint">{t('Monte o programa, salve e envie para revisão. A equipe EAFIT confere antes de ir ao ar; edições também passam por revisão.')}</p>
      {me.programs.length === 0 && <p className="dash-empty">{t('Você ainda não tem programas.')}</p>}
      <ul className="inf-programs">
        {me.programs.map(p => {
          const st = programStatus(p);
          const canSubmit = p.status === 'editing' || p.status === 'rejected';
          return (
            <li key={p.id} className="inf-program">
              <div className="inf-program__head">
                <strong className="inf-program__name">{p.draft.name}</strong>
                <span className={`inf-badge inf-badge--${st.key}`}>{st.label}</span>
              </div>
              <span className="inf-program__meta">
                {levelLabel(p.draft.level)} · {plural(p.draft.days.length, '1 dia', '{n} dias')}
                {p.live && <> · {t('{n} começaram', { n: p.adoptions })}</>}
              </span>
              {p.status === 'rejected' && p.review_note && (
                <p className="inf-note inf-note--error">{t('Motivo da equipe:')} {p.review_note}</p>
              )}
              <div className="inf-program__actions">
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy === p.id} onClick={() => setEditing(p)}>{t('Editar')}</button>
                {canSubmit && (
                  <button type="button" className="btn btn--primary btn--sm" disabled={busy === p.id}
                    onClick={() => run(p.id, () => submitProgram(p.id), t('📨 Enviado para revisão'))}>{t('Enviar para revisão')}</button>
                )}
                {p.live && (
                  <>
                    <button type="button" className="btn btn--ghost btn--sm" disabled={busy === p.id} onClick={() => handleShare(p)}>{t('Compartilhar')}</button>
                    <button type="button" className="btn btn--ghost btn--sm" disabled={busy === p.id}
                      onClick={() => run(p.id, () => setProgramHidden(p.id, !p.hidden), p.hidden ? t('Programa de volta ao ar') : t('Programa escondido'))}>
                      {p.hidden ? t('Mostrar') : t('Esconder')}
                    </button>
                  </>
                )}
                <button type="button" className="btn btn--ghost btn--sm inf-program__del" disabled={busy === p.id}
                  onClick={() => {
                    if (window.confirm(t('Excluir "{name}"? Quem já começou continua com o treino, mas ele sai da sua página.', { name: p.draft.name }))) {
                      run(p.id, () => deleteProgram(p.id), t('🗑️ Programa excluído'));
                    }
                  }}>{t('Excluir')}</button>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn--outline btn--full btn--sm" disabled={me.programs.length >= 20} onClick={() => setEditing(null)}>
        {t('+ Novo programa')}
      </button>

      {editing !== undefined && (
        <InfluencerProgramEditor
          program={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => { setEditing(undefined); toast(t('💾 Rascunho salvo. Envie para revisão quando estiver pronto.')); await onChanged(); }}
        />
      )}
    </div>
  );
}
