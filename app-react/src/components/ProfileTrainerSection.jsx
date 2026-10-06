import { useEffect, useState } from 'react';
import { fetchMyThread, markMessagesRead, sendReply, friendlyReplyError } from '../lib/trainerMessages';
import ChatThread from './ChatThread';
import MyAppointments from './MyAppointments';
import { fetchSharePhotos, setSharePhotos } from '../lib/trainerPhotos';
import { fetchMyGoals } from '../lib/trainerInsights';
import {
  normalizeTrainerCode, friendlyTrainerError, fetchMyTrainer, linkTrainer, unlinkTrainer,
} from '../lib/trainer';

// Perfil → Meu personal: o aluno entra com o código do personal (autorizando o
// acompanhamento) ou encerra o vínculo quando quiser.
export default function ProfileTrainerSection({ toast, onChange }) {
  const [trainer, setTrainer] = useState(undefined); // undefined = carregando, null = sem personal
  const [code, setCode] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [goals, setGoals] = useState(null);
  const [sharePhotos, setShare] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMyTrainer()
      .then(t => { if (active) { setTrainer(t); onChange?.(t); } })
      .catch(err => { console.error('fetchMyTrainer:', err); if (active) setTrainer(null); });
    return () => { active = false; };
  }, [onChange]);

  async function handleLink() {
    const c = normalizeTrainerCode(code);
    if (c.length < 4) { setError('Digite o código do seu personal.'); return; }
    setBusy(true); setError('');
    try {
      await linkTrainer(c);
      setCode(''); setAgree(false);
      const t = await fetchMyTrainer();
      setTrainer(t); onChange?.(t);
      toast('🤝 Vinculado ao seu personal');
    } catch (err) {
      setError(friendlyTrainerError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink() {
    if (!window.confirm('Encerrar o vínculo? Seu personal deixa de ver seus dados.')) return;
    setBusy(true);
    try {
      await unlinkTrainer();
      setTrainer(null); onChange?.(null);
      toast('Vínculo encerrado');
    } catch {
      toast('❌ Não foi possível encerrar agora');
    } finally {
      setBusy(false);
    }
  }

  // histórico de recados do personal; abrir esta seção marca tudo como lido
  useEffect(() => {
    if (!trainer) return undefined;
    let active = true;
    markMessagesRead().catch(() => { /* migration pendente */ });
    fetchSharePhotos().then(v => { if (active) setShare(v); }).catch(() => { /* migration pendente */ });
    fetchMyGoals().then(g => { if (active) setGoals(g); }).catch(() => { /* sem metas */ });
    return () => { active = false; };
  }, [trainer]);

  async function handleSharePhotos(next) {
    setShare(next);
    try { await setSharePhotos(next); toast(next ? '📸 Fotos compartilhadas com seu personal' : 'Fotos deixaram de ser compartilhadas'); }
    catch { setShare(!next); toast('❌ Não foi possível salvar'); }
  }

  if (trainer === undefined) return <p className="profile-field__hint">Carregando…</p>;

  if (trainer) {
    return (
      <>
        <p className="profile-field__hint">
          Você é aluno de <strong>{trainer.name}</strong>. Ele acompanha seus treinos, peso, medidas, check-ins e desconfortos.
          Você pode encerrar o vínculo quando quiser.
        </p>
        {goals && (
          <div className="personal-goals">
            <span className="profile-field__label">🎯 Metas do seu personal</span>
            <p>
              {[goals.weekly && `${goals.weekly} treinos por semana`, goals.weight && `peso alvo ${String(goals.weight).replace('.', ',')} kg`].filter(Boolean).join(' · ')}
            </p>
            {goals.note && <small>{goals.note}</small>}
          </div>
        )}
        <MyAppointments />
        <label className="trainer-consent">
          <input type="checkbox" checked={sharePhotos} onChange={e => handleSharePhotos(e.target.checked)} />
          <span><strong>Compartilhar minhas fotos de evolução</strong><br />Seu personal passa a ver as fotos que você já tirou e as próximas. Desligado por padrão; você desliga quando quiser.</span>
        </label>
        <div className="personal-history">
          <span className="profile-field__label">Conversa com o personal</span>
          <ChatThread me="client" load={fetchMyThread} send={sendReply} onError={friendlyReplyError} placeholder="Responda ao seu personal…" />
        </div>
        <button type="button" className="btn btn--outline btn--full" disabled={busy} onClick={handleUnlink}>Encerrar vínculo</button>
      </>
    );
  }

  return (
    <>
      <p className="profile-field__hint">Tem um personal trainer? Digite o código que ele te passou para ele acompanhar a sua evolução.</p>
      <div className="profile-field">
        <label className="profile-field__label" htmlFor="trainerCode">Código do personal</label>
        <input
          id="trainerCode" className="input input--sm" placeholder="Ex: P1A2B3" maxLength={12} autoCapitalize="characters"
          value={code} onChange={e => setCode(e.target.value)}
        />
      </div>
      <label className="trainer-consent">
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
        <span>Autorizo meu personal a ver meus treinos, peso, medidas, check-ins e desconfortos. Posso encerrar quando quiser.</span>
      </label>
      {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
      <button type="button" className="btn btn--primary btn--full" disabled={busy || !agree || !code.trim()} onClick={handleLink}>
        {busy ? 'Vinculando…' : 'Vincular ao personal'}
      </button>
    </>
  );
}
