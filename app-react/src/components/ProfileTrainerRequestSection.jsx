import { useCallback, useEffect, useState } from 'react';
import { fetchMyTrainerRequest, friendlyTrainerRequestError, normalizeCref, requestTrainerAccess } from '../lib/trainerRequest';
import { t } from '../lib/i18n';

// Perfil → Sou personal trainer: pedido de acesso ao modo Personal com o CREF,
// conferido pela equipe. Some para quem já é personal.
export default function ProfileTrainerRequestSection({ toast }) {
  const [req, setReq] = useState(undefined);
  const [name, setName] = useState('');
  const [cref, setCref] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setReq(await fetchMyTrainerRequest()); } catch { setReq(null); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    setError('');
    const normalized = normalizeCref(cref);
    if (!normalized) { setError(t('CREF inválido. Use o formato 012345-G/SP.')); return; }
    if (name.trim().length < 5) { setError(t('Informe seu nome completo.')); return; }
    setBusy(true);
    try {
      await requestTrainerAccess(name.trim(), normalized, note.trim());
      toast?.(t('📨 Pedido enviado! Avisamos aqui no app quando for analisado.'));
      await load();
    } catch (err) {
      setError(friendlyTrainerRequestError(err));
    } finally {
      setBusy(false);
    }
  }

  if (req === undefined) return <p className="profile-field__hint">{t('Carregando…')}</p>;
  if (req?.status === 'personal') return <p className="profile-field__hint">{t('Seu acesso de personal já está liberado. Use o botão 🧑‍🏫 Personal no topo do app.')}</p>;
  if (req?.status === 'pendente') {
    return (
      <p className="profile-field__hint">
        {t('Pedido em análise (CREF {cref}). Avisamos aqui no app quando a equipe conferir.', { cref: req.cref })}
      </p>
    );
  }

  return (
    <>
      {req?.status === 'recusado' && (
        <p className="profile-field__hint" role="status">
          {t('Seu último pedido não foi aprovado: {reason}', { reason: req.reason })}
        </p>
      )}
      <p className="profile-field__hint">
        {t('É personal trainer? Peça o acesso ao modo Personal para acompanhar seus alunos pelo app. A equipe confere seu CREF no CONFEF antes de liberar.')}
      </p>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="trainerReqName">{t('Nome completo (como no CREF)')}</label>
        <input id="trainerReqName" className="input input--sm" maxLength={120} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="trainerReqCref">{t('CREF')}</label>
        <input id="trainerReqCref" className="input input--sm" placeholder={t('Ex: 012345-G/SP')} maxLength={16} autoCapitalize="characters"
          value={cref} onChange={e => setCref(e.target.value)} />
      </div>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="trainerReqNote">{t('Onde você atende (opcional)')}</label>
        <input id="trainerReqNote" className="input input--sm" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
      </div>
      {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
      <button type="button" className="btn btn--primary btn--full" disabled={busy || !name.trim() || !cref.trim()} onClick={submit}>
        {t('Pedir acesso de personal')}
      </button>
    </>
  );
}
