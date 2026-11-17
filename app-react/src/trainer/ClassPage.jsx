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
import { useDeferredRemoval } from '../lib/useDeferredRemoval';

import { t, diasRestantes } from '../lib/i18n';
// Aba Turma do personal: cria desafios para os alunos (todos entram sozinhos),
// acompanha o placar e encerra. O personal participa como coach, sem ranking.
export default function ClassPage({ header }) {
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
  const removal = useDeferredRemoval();
  const today = todayDate();

  const reload = useCallback(async () => {
    try { setItems(await fetchMyChallenges()); } catch (err) { console.error('fetchMyChallenges:', err); setItems([]); }
  }, []);

  useEffect(() => {
    reload();
    fetchClients().then(setClients).catch(err => console.error('fetchClients:', err));
  }, [reload]);

  const shown = (items || []).filter(c => !removal.hidden.has(c.id));
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
      toast(t('🏁 Desafio criado e alunos avisados'));
      await reload();
    } catch (err) {
      setError(friendlyChallengeError(err));
    } finally {
      setBusy(false);
    }
  }

  // Some da lista na hora; apagar para todos os alunos (placar incluído, sem volta)
  // só vai ao servidor em 6s, ou ao sair da tela, a não ser que desfaça. Os alunos
  // continuam vendo o desafio até lá.
  function handleDelete(c) {
    setOpen(null);
    removal.schedule(c.id, async () => {
      try { await deleteClassChallenge(c.id); } catch { toast(t('❌ Não foi possível apagar')); }
      await reload();
    });
    toast(t('Desafio "{title}" apagado para todos', { title: c.title }), 6000, {
      action: { label: t('Desfazer'), onClick: () => removal.undo(c.id) },
    });
  }

  return (
    <section className="page active trainer-page">
      {header}
      <div className="dash-card">
        <div className="dash-card__title">{t('🏆 Desafios da turma')}</div>
        {items && shown.length === 0 && !creating && (
          <p className="dash-empty">{t('Crie um desafio: todos os seus alunos entram e vence quem treinar mais dias no período.')}</p>
        )}

        {shown.map(c => {
          const status = challengeStatus(c, today);
          const left = daysLeft(c, today);
          const expanded = open === c.id;
          return (
            <div className="challenge" key={c.id}>
              <button type="button" className="challenge__head" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.id)}>
                <span className="challenge__title">{c.title}</span>
                <span className="challenge__meta">
                  {status === 'encerrado' ? t('Encerrado') : status === 'futuro' ? t('Ainda não começou') : diasRestantes(left)}
                  {' · '}{c.members} {t('aluno(s)')}
                </span>
              </button>
              {expanded && (
                <div className="challenge__body">
                  <Leaderboard id={c.id} />
                  <div className="challenge__actions">
                    <button type="button" className="btn btn--outline btn--sm" onClick={() => handleDelete(c)}>{t('Apagar desafio')}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {creating ? (
          <div className="challenge__form">
            <input className="input input--sm" placeholder={t('Nome do desafio')} maxLength={TITLE_MAX}
              value={title} onChange={e => setTitle(e.target.value)} aria-label={t('Nome do desafio')} />
            <select className="input input--sm" value={days} onChange={e => setDays(Number(e.target.value))} aria-label={t('Duração')}>
              {DURATION_OPTIONS.map(d => <option key={d} value={d}>{t('{d} dias, começando hoje', { d })}</option>)}
            </select>
            <span className="profile-field__label">{t('Quem participa?')}</span>
            <div className="measure-chips" role="group" aria-label={t('Participantes')}>
              <button type="button" aria-pressed={selected.length === 0}
                className={selected.length === 0 ? 'recap__btn recap__btn--active' : 'recap__btn'}
                onClick={() => setSelected([])}>{t('Todos os alunos')}</button>
              {clients.map(c => (
                <button key={c.id} type="button" aria-pressed={selected.includes(c.id)}
                  className={selected.includes(c.id) ? 'recap__btn recap__btn--active' : 'recap__btn'}
                  onClick={() => toggle(c.id)}>{c.name}</button>
              ))}
            </div>
            {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleCreate}>
              {busy ? t('Criando…') : t('Criar e avisar alunos')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn--outline btn--sm" disabled={clients.length === 0}
            onClick={() => { setCreating(true); setError(''); }}>{t('+ Novo desafio da turma')}</button>
        )}
      </div>
    </section>
  );
}
