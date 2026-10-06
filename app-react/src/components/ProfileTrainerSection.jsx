import { useEffect, useState } from 'react';
import { fetchMyMessages, markMessagesRead } from '../lib/trainerMessages';
import { fmtDate } from '../lib/utils';
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
  const [messages, setMessages] = useState([]);

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
    fetchMyMessages(10)
      .then(rows => { if (active) setMessages(rows); return markMessagesRead(); })
      .catch(() => { /* migration pendente: sem histórico */ });
    return () => { active = false; };
  }, [trainer]);

  if (trainer === undefined) return <p className="profile-field__hint">Carregando…</p>;

  if (trainer) {
    return (
      <>
        <p className="profile-field__hint">
          Você é aluno de <strong>{trainer.name}</strong>. Ele acompanha seus treinos, peso, medidas, check-ins e desconfortos.
          Você pode encerrar o vínculo quando quiser.
        </p>
        {messages.length > 0 && (
          <div className="personal-history">
            <span className="profile-field__label">Recados do personal</span>
            {messages.map(m => (
              <div className="personal-history__item" key={m.id}>
                <small>{m.kind === 'treino' ? '📋 ' : ''}{fmtDate(String(m.at).slice(0, 10))}</small>
                <p>{m.body}</p>
              </div>
            ))}
          </div>
        )}
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
