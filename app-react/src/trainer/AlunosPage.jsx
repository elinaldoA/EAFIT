import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { clientAttention, sortClients, fetchClients, fetchTrainerCode } from '../lib/trainer';
import { weekOverview } from '../lib/trainerSettings';
import Skeleton from '../components/Skeleton';
import ClientDetail from './ClientDetail';

const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'atencao', label: 'Precisam de atenção' },
  { key: 'ok', label: 'Em dia' },
];

function inviteText(code) {
  return `Quer treinar comigo pelo EAFIT? Abra o app, vá em Perfil → Meu personal e digite o código ${code}.`;
}

// Lista de alunos do personal, com quem precisa de atenção no topo.
export default function AlunosPage({ onClientsLoaded }) {
  const toast = useToast();
  const [clients, setClients] = useState(null);
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState('todos');
  const [selected, setSelected] = useState(null);
  const today = todayDate();

  const reload = useCallback(async () => {
    try {
      const list = await fetchClients();
      setClients(list);
      onClientsLoaded?.(list.filter(c => ['risco', 'atencao'].includes(clientAttention(c, todayDate()).level)).length);
    } catch (err) {
      console.error('fetchClients:', err);
      setClients([]);
    }
  }, [onClientsLoaded]);

  useEffect(() => {
    reload();
    fetchTrainerCode().then(setCode).catch(err => console.error('fetchTrainerCode:', err));
  }, [reload]);

  const sorted = useMemo(() => (clients ? sortClients(clients, today) : []), [clients, today]);
  const visible = useMemo(() => sorted.filter(c => {
    const level = clientAttention(c, today).level;
    if (filter === 'atencao') return level === 'risco' || level === 'atencao' || level === 'novo';
    if (filter === 'ok') return level === 'ok';
    return true;
  }), [sorted, filter, today]);
  const week = useMemo(() => weekOverview(clients || []), [clients]);
  const needAttention = sorted.filter(c => ['risco', 'atencao'].includes(clientAttention(c, today).level)).length;

  async function handleShare() {
    const text = inviteText(code);
    try {
      if (navigator.share) await navigator.share({ title: 'EAFIT', text });
      else { await navigator.clipboard.writeText(text); toast('📋 Convite copiado'); }
    } catch (err) {
      if (err?.name !== 'AbortError') toast(`Seu código: ${code}`);
    }
  }

  if (selected) {
    return (
      <ClientDetail
        client={selected}
        onBack={() => setSelected(null)}
        onRemoved={() => { setSelected(null); reload(); }}
      />
    );
  }

  return (
    <section className="page active trainer-page">
      <div className="dash-card trainer-code">
        <div>
          <span className="trainer-code__label">Seu código de convite</span>
          <strong className="trainer-code__value">{code || '…'}</strong>
        </div>
        <button type="button" className="btn btn--primary btn--sm" disabled={!code} onClick={handleShare}>📤 Convidar aluno</button>
      </div>
      <p className="profile-field__hint">O aluno digita esse código em Perfil → Meu personal e autoriza você a acompanhar o treino dele.</p>

      {clients && clients.length > 0 && (
        <>
          <div className="dash-card">
            <div className="dash-card__title">Esta semana</div>
            <div className="recap__grid">
              <div className="recap__stat"><span className="recap__value">{week.active}/{week.total}</span><span className="recap__label">alunos treinaram (7 dias)</span></div>
              <div className="recap__stat"><span className="recap__value">{week.sessions}</span><span className="recap__label">treinos no total</span></div>
              <div className="recap__stat"><span className="recap__value">{week.idle}</span><span className="recap__label">sem treinar na semana</span></div>
            </div>
          </div>
          <div className="trainer-summary">
            <span><strong>{clients.length}</strong> aluno(s)</span>
            <span className={needAttention ? 'trainer-summary__warn' : ''}><strong>{needAttention}</strong> precisam de atenção</span>
          </div>
          <div className="measure-chips" role="group" aria-label="Filtro de alunos">
            {FILTERS.map(f => (
              <button
                key={f.key} type="button" aria-pressed={filter === f.key}
                className={filter === f.key ? 'recap__btn recap__btn--active' : 'recap__btn'}
                onClick={() => setFilter(f.key)}
              >{f.label}</button>
            ))}
          </div>
        </>
      )}

      {!clients && <Skeleton height={86} />}
      {clients && clients.length === 0 && (
        <div className="dash-card"><p className="dash-empty">Nenhum aluno vinculado ainda. Compartilhe seu código para começar.</p></div>
      )}
      {clients && clients.length > 0 && visible.length === 0 && <p className="dash-empty">Nenhum aluno neste filtro.</p>}

      {visible.map(c => {
        const att = clientAttention(c, today);
        return (
          <button type="button" className="dash-card client-row" key={c.id} onClick={() => setSelected(c)}>
            <div className="client-row__main">
              <strong>{c.name}</strong>
              <span className={`client-badge client-badge--${att.level}`}>{att.label}</span>
            </div>
            <div className="client-row__meta">
              <span>{c.days7} treino(s) nos últimos 7 dias</span>
              <span>{c.days30} em 30 dias</span>
            </div>
          </button>
        );
      })}
    </section>
  );
}
