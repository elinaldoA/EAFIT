import { useCallback, useEffect, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { fetchClients } from '../lib/trainer';
import { sendMessage } from '../lib/trainerMessages';
import {
  DURATION_OPTIONS, TITLE_MAX, validateChallenge, challengeStatus, daysLeft, addDaysStr, classChallengeMessage,
  friendlyChallengeError, fetchMyChallenges, createClassChallenge, deleteClassChallenge,
} from '../lib/challenges';
import { Leaderboard } from '../components/Challenges';

// Aba Turma do personal: cria desafios para os alunos (todos entram sozinhos),
// acompanha o placar e encerra. O personal participa como coach, sem ranking.
export default function ClassPage() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [days, setDays] = useState(14);
  const [selected, setSelected] = useState([]); // vazio = todos
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayDate();

  const reload = useCallback(async () => {
    try { setItems(await fetchMyChallenges()); } catch (err) { console.error('fetchMyChallenges:', err); setItems([]); }
  }, []);

  useEffect(() => {
    reload();
    fetchClients().then(setClients).catch(err => console.error('fetchClients:', err));
  }, [reload]);

  const toggle = id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  async function handleCreate() {
    const check = validateChallenge(title, days);
    if (!check.ok) { setError(check.error); return; }
    const end = addDaysStr(today, days - 1);
    setBusy(true); setError('');
    try {
      await createClassChallenge(check.title, today, end, selected);
      // aviso aos alunos (melhor esforço: o desafio já foi criado)
      sendMessage(selected, classChallengeMessage(check.title, end)).catch(err => console.warn('aviso do desafio:', err));
      setCreating(false); setTitle(''); setSelected([]);
      toast('🏁 Desafio criado e alunos avisados');
      await reload();
    } catch (err) {
      setError(friendlyChallengeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(c) {
    if (!window.confirm(`Encerrar e apagar o desafio "${c.title}" para todos?`)) return;
    try { await deleteClassChallenge(c.id); toast('Desafio apagado'); setOpen(null); await reload(); }
    catch { toast('❌ Não foi possível apagar'); }
  }

  return (
    <section className="page active trainer-page">
      <div className="dash-card">
        <div className="dash-card__title">🏆 Desafios da turma</div>
        {items && items.length === 0 && !creating && (
          <p className="dash-empty">Crie um desafio: todos os seus alunos entram e vence quem treinar mais dias no período.</p>
        )}

        {(items || []).map(c => {
          const status = challengeStatus(c, today);
          const left = daysLeft(c, today);
          const expanded = open === c.id;
          return (
            <div className="challenge" key={c.id}>
              <button type="button" className="challenge__head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.id)}>
                <span className="challenge__title">{c.title}</span>
                <span className="challenge__meta">
                  {status === 'encerrado' ? 'Encerrado' : status === 'futuro' ? 'Ainda não começou' : left === 0 ? 'Último dia' : `${left} dia(s) restantes`}
                  {' · '}{c.members} aluno(s)
                </span>
              </button>
              {expanded && (
                <div className="challenge__body">
                  <Leaderboard id={c.id} />
                  <div className="challenge__actions">
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => handleDelete(c)}>Apagar desafio</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {creating ? (
          <div className="challenge__form">
            <input className="input input--sm" placeholder="Nome do desafio" maxLength={TITLE_MAX}
              value={title} onChange={e => setTitle(e.target.value)} aria-label="Nome do desafio" />
            <select className="input input--sm" value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Duração">
              {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d} dias, começando hoje</option>)}
            </select>
            <span className="profile-field__label">Quem participa?</span>
            <div className="measure-chips" role="group" aria-label="Participantes">
              <button type="button" aria-pressed={selected.length === 0}
                className={selected.length === 0 ? 'recap__btn recap__btn--active' : 'recap__btn'}
                onClick={() => setSelected([])}>Todos os alunos</button>
              {clients.map(c => (
                <button key={c.id} type="button" aria-pressed={selected.includes(c.id)}
                  className={selected.includes(c.id) ? 'recap__btn recap__btn--active' : 'recap__btn'}
                  onClick={() => toggle(c.id)}>{c.name}</button>
              ))}
            </div>
            {error && <p className="profile-field__hint" role="alert" style={{ color: 'var(--error)' }}>{error}</p>}
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleCreate}>
              {busy ? 'Criando…' : 'Criar e avisar alunos'}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--outline btn--sm" disabled={clients.length === 0}
            onClick={() => { setCreating(true); setError(''); }}>+ Novo desafio da turma</button>
        )}
      </div>
    </section>
  );
}
