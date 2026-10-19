import { useCallback, useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { clientAttention, sortClients, fetchClients, fetchTrainerCode } from '../lib/trainer';
import { weekOverview } from '../lib/trainerSettings';
import { fetchUnreadReplies } from '../lib/trainerMessages';
import { fetchTrainerAppointments, upcomingAppointments, formatWhen } from '../lib/trainerAppointments';
import { trainerInviteLink, shareTrainerInvite, copyTrainerInviteLink, fetchInviteStats } from '../lib/trainerInvite';
import Skeleton from '../components/Skeleton';
import ClientDetail from './ClientDetail';

import { t } from '../lib/i18n';
const FILTERS = [
  { key: 'todos', label: t('Todos') },
  { key: 'atencao', label: t('Precisam de atenção') },
  { key: 'ok', label: t('Em dia') },
];

// Lista de alunos do personal, com quem precisa de atenção no topo.
export default function AlunosPage({ onClientsLoaded }) {
  const toast = useToast();
  const [clients, setClients] = useState(null);
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState('todos');
  const [selected, setSelected] = useState(null);
  const [replies, setReplies] = useState({});
  const [appts, setAppts] = useState([]);
  const [inviteStats, setInviteStats] = useState(null);
  const today = todayDate();

  const reload = useCallback(async () => {
    try {
      const list = await fetchClients();
      setClients(list);
      fetchTrainerAppointments().then(r => setAppts(upcomingAppointments(r))).catch(() => { /* migration pendente */ });
      fetchUnreadReplies().then(setReplies).catch(() => { /* migration pendente */ });
      onClientsLoaded?.(list.filter(c => ['risco', 'atencao'].includes(clientAttention(c, todayDate()).level)).length);
    } catch (err) {
      console.error('fetchClients:', err);
      setClients([]);
    }
  }, [onClientsLoaded]);

  useEffect(() => {
    reload();
    fetchTrainerCode().then(setCode).catch(err => console.error('fetchTrainerCode:', err));
    fetchInviteStats(30).then(setInviteStats).catch(() => { /* migration pendente */ });
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
    const result = await shareTrainerInvite(code);
    if (result === 'copied') toast(t('📋 Convite copiado'));
    else if (result === 'failed') toast(t('Seu código: {code}', { code }));
  }

  async function handleCopyLink() {
    toast(await copyTrainerInviteLink(code) ? t('🔗 Link copiado') : t('⚠️ Não deu pra copiar o link'));
  }

  if (selected) {
    return (
      <ClientDetail
        client={selected}
        onBack={() => { setSelected(null); reload(); }}
        onRemoved={() => { setSelected(null); reload(); }}
      />
    );
  }

  return (
    <section className="page active trainer-page">
      <div className="dash-card trainer-code">
        <div>
          <span className="trainer-code__label">{t('Seu código de convite')}</span>
          <strong className="trainer-code__value">{code || '…'}</strong>
        </div>
        <button type="button" className="btn btn--primary btn--sm" disabled={!code} onClick={handleShare}>{t('📤 Convidar aluno')}</button>
      </div>
      <p className="profile-field__hint">{t('O aluno digita esse código em Perfil → Meu personal e autoriza você a acompanhar o treino dele.')}</p>

      {code && (
        <div className="dash-card trainer-link">
          <div className="dash-card__title">{t('🔗 Seu link de divulgação')}</div>
          <code className="trainer-link__url">{trainerInviteLink(code)}</code>
          <div className="trainer-link__actions">
            <button type="button" className="btn btn--outline btn--sm" onClick={handleCopyLink}>{t('Copiar link')}</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleShare}>{t('Compartilhar')}</button>
          </div>
          <p className="profile-field__hint">{t('Poste na bio, nos stories ou mande no WhatsApp. Quem cria a conta pelo link recebe o pedido para autorizar você e já entra na sua lista.')}</p>
          {inviteStats && (
            <div className="recap__grid">
              <div className="recap__stat"><span className="recap__value">{inviteStats.visits}</span><span className="recap__label">{t('visitas pelo link (30 dias)')}</span></div>
              <div className="recap__stat"><span className="recap__value">{inviteStats.signups}</span><span className="recap__label">{t('contas criadas (30 dias)')}</span></div>
              <div className="recap__stat"><span className="recap__value">{inviteStats.clients}</span><span className="recap__label">{t('alunos que entraram pelo link')}</span></div>
            </div>
          )}
        </div>
      )}

      {appts.length > 0 && (
        <div className="dash-card">
          <div className="dash-card__title">{t('📅 Próximas aulas')}</div>
          {appts.slice(0, 5).map(a => (
            <div className="appt" key={a.id}>
              <div><strong>{formatWhen(a.starts)}</strong> · {a.name}
                <span className={`appt__status appt__status--${a.status}`}>{a.status === 'confirmed' ? t('Confirmada') : t('Aguardando')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {clients && clients.length > 0 && (
        <>
          <div className="dash-card">
            <div className="dash-card__title">{t('Esta semana')}</div>
            <div className="recap__grid">
              <div className="recap__stat"><span className="recap__value">{week.active}/{week.total}</span><span className="recap__label">{t('alunos treinaram (7 dias)')}</span></div>
              <div className="recap__stat"><span className="recap__value">{week.sessions}</span><span className="recap__label">{t('treinos no total')}</span></div>
              <div className="recap__stat"><span className="recap__value">{week.idle}</span><span className="recap__label">{t('sem treinar na semana')}</span></div>
            </div>
          </div>
          <div className="trainer-summary">
            <span><strong>{clients.length}</strong> {t('aluno(s)')}</span>
            <span className={needAttention ? 'trainer-summary__warn' : ''}><strong>{needAttention}</strong> {t('precisam de atenção')}</span>
          </div>
          <div className="measure-chips" role="group" aria-label={t('Filtro de alunos')}>
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
        <div className="dash-card"><p className="dash-empty">{t('Nenhum aluno vinculado ainda. Compartilhe seu código para começar.')}</p></div>
      )}
      {clients && clients.length > 0 && visible.length === 0 && <p className="dash-empty">{t('Nenhum aluno neste filtro.')}</p>}

      {visible.map(c => {
        const att = clientAttention(c, today);
        return (
          <button type="button" className="dash-card client-row" key={c.id} onClick={() => setSelected(c)}>
            <div className="client-row__main">
              <strong>{c.name}</strong>
              <span className={`client-badge client-badge--${att.level}`}>{att.label}</span>
            </div>
            {replies[c.id] > 0 && <span className="client-row__reply">💬 {replies[c.id]} {t('resposta(s) nova(s)')}</span>}
            <div className="client-row__meta">
              <span>{t('{days7} treino(s) nos últimos 7 dias', { days7: c.days7 })}</span>
              <span>{c.days30} {t('em 30 dias')}</span>
            </div>
          </button>
        );
      })}
    </section>
  );
}
