import { useEffect, useMemo, useState } from 'react';
import { todayDate } from '../data/treinoData';
import { useToast } from '../context/useToast';
import { toDateStr } from '../lib/utils';
import { fetchTrainerCode } from '../lib/trainer';
import { fetchRoster, buildActionQueue, rosterKpis, initials } from '../lib/trainerRoster';
import { fetchUnreadReplies } from '../lib/trainerMessages';
import { fetchTrainerAppointments, upcomingAppointments } from '../lib/trainerAppointments';
import { trainerInviteLink, shareTrainerInvite, copyTrainerInviteLink, fetchInviteStats } from '../lib/trainerInvite';
import Skeleton from '../components/Skeleton';
import PartnerCampaignsCard from '../components/PartnerCampaignsCard';

import { t, locale } from '../lib/i18n';
const QUEUE_PREVIEW = 6;

function dayLabel(iso, today) {
  const day = toDateStr(new Date(iso));
  if (day === today) return t('Hoje');
  const tomorrow = toDateStr(new Date(new Date(`${today}T12:00:00`).getTime() + 86400000));
  if (day === tomorrow) return t('Amanhã');
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' });
}

const hourOf = iso => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

// Tela inicial do personal: como a carteira está, quem precisa de quê agora,
// a agenda e os atalhos do dia a dia. Tocar num aluno abre a ficha dele.
export default function PainelPage({ userName, onOpenClient, onNavigate, onQueueLoaded }) {
  const toast = useToast();
  const [roster, setRoster] = useState(null);
  const [replies, setReplies] = useState({});
  const [appts, setAppts] = useState([]);
  const [code, setCode] = useState('');
  const [inviteStats, setInviteStats] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const today = todayDate();

  useEffect(() => {
    let active = true;
    fetchRoster()
      .then(r => { if (active) setRoster(r); })
      .catch(err => { console.error('fetchRoster:', err); if (active) setRoster([]); });
    fetchUnreadReplies().then(r => { if (active) setReplies(r); }).catch(() => { /* migration pendente */ });
    fetchTrainerAppointments().then(r => { if (active) setAppts(upcomingAppointments(r)); }).catch(() => { /* migration pendente */ });
    fetchTrainerCode().then(c => { if (active) setCode(c); }).catch(err => console.error('fetchTrainerCode:', err));
    fetchInviteStats(30).then(s => { if (active) setInviteStats(s); }).catch(() => { /* migration pendente */ });
    return () => { active = false; };
  }, []);

  const queue = useMemo(() => (roster ? buildActionQueue(roster, { replies, today }) : []), [roster, replies, today]);
  const kpis = useMemo(() => rosterKpis(roster || [], today), [roster, today]);
  const todayCount = appts.filter(a => toDateStr(new Date(a.starts)) === today).length;

  useEffect(() => { if (roster) onQueueLoaded?.(queue.filter(q => q.priority <= 2).length); }, [roster, queue, onQueueLoaded]);

  async function handleShare() {
    const result = await shareTrainerInvite(code);
    if (result === 'copied') toast(t('📋 Convite copiado'));
    else if (result === 'failed') toast(t('Seu código: {code}', { code }));
  }

  async function handleCopyLink() {
    toast(await copyTrainerInviteLink(code) ? t('🔗 Link copiado') : t('⚠️ Não deu pra copiar o link'));
  }

  const first = String(userName || '').trim().split(/\s+/)[0];
  const dateText = new Date(`${today}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const visibleQueue = showAll ? queue : queue.slice(0, QUEUE_PREVIEW);

  return (
    <section className="page active trainer-page">
      <div className="painel-hello">
        <small>{dateText}</small>
        <h2>{first ? t('Olá, {name}', { name: first }) : t('Olá!')}</h2>
      </div>

      {!roster && <Skeleton height={86} />}

      {roster && roster.length > 0 && (
        <div className="kpi-grid">
          <button type="button" className="kpi" onClick={() => onNavigate('alunos')}>
            <span className="kpi__value">{kpis.total}</span>
            <span className="kpi__label">{t('alunos ativos')}</span>
          </button>
          <div className="kpi">
            <span className="kpi__value">{kpis.active7}<small>/{kpis.total}</small></span>
            <span className="kpi__label">{t('treinaram em 7 dias · {n} treinos', { n: kpis.sessions7 })}</span>
          </div>
          <div className="kpi">
            <span className={`kpi__value${kpis.adherenceAvg !== null && kpis.adherenceAvg < 50 ? ' kpi__value--warn' : ''}`}>
              {kpis.adherenceAvg === null ? '—' : `${kpis.adherenceAvg}%`}
            </span>
            <span className="kpi__label">{t('aderência média à meta semanal')}</span>
          </div>
          <div className="kpi">
            <span className={`kpi__value${kpis.plansDue ? ' kpi__value--warn' : ''}`}>{kpis.plansDue}</span>
            <span className="kpi__label">{t('planos vencendo ou vencidos')}</span>
          </div>
        </div>
      )}

      {roster && roster.length > 0 && (
        <div className="dash-card">
          <div className="dash-card__title-row">
            <div className="dash-card__title">{t('⚡ Precisam de você')}</div>
            {queue.length > 0 && <span className="painel-count">{queue.length}</span>}
          </div>
          {queue.length === 0 && <p className="dash-empty">{t('Tudo em dia: ninguém parado, sem dor relatada e planos no prazo. 🎉')}</p>}
          {visibleQueue.map(({ client, reasons, priority }) => (
            <button type="button" key={client.id} className={`action-row action-row--p${Math.min(priority, 3)}`} onClick={() => onOpenClient(client)}>
              <span className="avatar" aria-hidden="true">{initials(client.name)}</span>
              <span className="action-row__body">
                <strong>{client.name}</strong>
                <span className="action-row__reasons">
                  {reasons.map(r => <span key={r.kind + r.label} className="reason-chip">{r.icon} {r.label}</span>)}
                </span>
              </span>
              <span className="action-row__go" aria-hidden="true">›</span>
            </button>
          ))}
          {queue.length > QUEUE_PREVIEW && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAll(v => !v)}>
              {showAll ? t('Mostrar menos') : t('Ver todos ({n})', { n: queue.length })}
            </button>
          )}
        </div>
      )}

      <div className="dash-card">
        <div className="dash-card__title-row">
          <div className="dash-card__title">{t('📅 Agenda')}</div>
          {todayCount > 0 && <span className="painel-count">{t('{n} hoje', { n: todayCount })}</span>}
        </div>
        {appts.length === 0 && <p className="dash-empty">{t('Nenhuma aula marcada. Marque pela ficha do aluno, na aba Plano.')}</p>}
        {appts.slice(0, 6).map(a => (
          <div className="appt" key={a.id}>
            <div className="appt__when">
              <strong>{dayLabel(a.starts, today)}</strong>
              <small>{hourOf(a.starts)}</small>
            </div>
            <div style={{ flex: 1 }}>
              {a.name}
              {a.place && <small>{a.place}</small>}
            </div>
            <span className={`appt__status appt__status--${a.status}`}>{a.status === 'confirmed' ? t('Confirmada') : t('Aguardando')}</span>
          </div>
        ))}
      </div>

      <div className="quick-grid">
        <button type="button" className="quick" onClick={() => onNavigate('modelos')}><span aria-hidden="true">🧩</span>{t('Modelos de treino')}</button>
        <button type="button" className="quick" onClick={() => onNavigate('turma')}><span aria-hidden="true">💬</span>{t('Recado para a turma')}</button>
        <button type="button" className="quick" onClick={() => onNavigate('turma', 'desafios')}><span aria-hidden="true">🏆</span>{t('Novo desafio')}</button>
        <button type="button" className="quick" disabled={!code} onClick={handleShare}><span aria-hidden="true">📤</span>{t('Convidar aluno')}</button>
      </div>

      {roster && roster.length === 0 && (
        <div className="dash-card"><p className="dash-empty">{t('Nenhum aluno vinculado ainda. Compartilhe seu código ou link para começar.')}</p></div>
      )}

      <div className="dash-card trainer-code">
        <div>
          <span className="trainer-code__label">{t('Seu código de convite')}</span>
          <strong className="trainer-code__value">{code || '…'}</strong>
        </div>
        <button type="button" className="btn btn--primary btn--sm" disabled={!code} onClick={handleShare}>{t('📤 Convidar aluno')}</button>
      </div>

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

      <PartnerCampaignsCard toast={toast} />
    </section>
  );
}
