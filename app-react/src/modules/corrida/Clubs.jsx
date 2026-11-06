import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../context/useToast';
import { FRIEND_INVITE_URL } from '../../lib/links';
import {
  fetchClubs, createClub, joinClub, leaveClub, deleteClub, fetchClubRanking, normalizeClubCode,
  clubInviteText, clubError, formatKm, CLUB_NAME_MAX, CLUB_DESC_MAX, CLUB_LIMIT,
} from './runs';
import { t } from '../../lib/i18n';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Ranking de km de um clube, da semana ou do mês.
function ClubRanking({ club }) {
  const [period, setPeriod] = useState('week');
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(null); setFailed(false);
    fetchClubRanking(club.id, period)
      .then(r => { if (alive) setRows(r); })
      .catch(err => { console.error('ClubRanking:', err); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [club.id, period]);

  return (
    <div className="run-club__ranking">
      <div className="run-chips" role="group" aria-label={t('Período do ranking')}>
        {[['week', t('Semana')], ['month', t('Mês')]].map(([key, label]) => (
          <button key={key} type="button" aria-pressed={period === key} className={`run-chip${period === key ? ' run-chip--on' : ''}`} onClick={() => setPeriod(key)}>{label}</button>
        ))}
      </div>
      {failed && <p className="dash-empty">{t('Não deu para carregar o ranking agora.')}</p>}
      {!failed && !rows && <p className="dash-empty">{t('Carregando…')}</p>}
      {rows && (
        <ol className="challenge__board run-ranking">
          {rows.map((r, i) => (
            <li key={i} className={r.isMe ? 'challenge__row challenge__row--me' : 'challenge__row'}>
              <span>{r.hidden ? '🙈' : (MEDAL[r.rank] || `${r.rank}º`)} {r.isMe ? t('Você') : r.name}</span>
              <strong>{r.hidden ? t('oculto') : t('{v1} km', { v1: formatKm(r.meters, 1) })}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ClubCard({ club, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);

  async function invite() {
    const text = clubInviteText(club, FRIEND_INVITE_URL);
    try {
      if (navigator.share) await navigator.share({ title: 'EAFIT Run', text });
      else { await navigator.clipboard.writeText(text); toast(t('📋 Convite copiado')); }
    } catch (err) {
      if (err?.name !== 'AbortError') toast(t('Código: {code}', { code: club.code }));
    }
  }

  async function leave() {
    if (!window.confirm(t('Sair do clube {name}?', { name: club.name }))) return;
    try { await leaveClub(club.id); toast(t('Você saiu do clube')); onChanged(); }
    catch (err) { toast(clubError(err)); }
  }

  async function remove() {
    if (!window.confirm(t('Encerrar o clube {name} para todos os {v1} membros?', { name: club.name, v1: club.members }))) return;
    try { await deleteClub(club.id); toast(t('Clube encerrado')); onChanged(); }
    catch (err) { toast(clubError(err)); }
  }

  return (
    <div className="run-club">
      <button type="button" className="run-club__head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>
          <strong>{club.name}</strong>
          <span className="run-challenge__meta"> · {t('{v1} membros', { v1: club.members })}{club.isOwner ? ` · ${t('você criou')}` : ''}</span>
        </span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {club.description && <p className="profile-field__hint">{club.description}</p>}
          <ClubRanking club={club} />
          <div className="friends__me">
            <span>{t('Código:')} <strong className="friends__code">{club.code}</strong></span>
            <button type="button" className="btn btn--outline btn--sm" onClick={invite}>{t('📤 Convidar')}</button>
          </div>
          <div className="friends__actions">
            <button type="button" className="btn btn--outline btn--sm" onClick={leave}>{t('Sair do clube')}</button>
            {club.isOwner && <button type="button" className="btn btn--outline btn--sm" onClick={remove}>{t('Encerrar clube')}</button>}
          </div>
        </>
      )}
    </div>
  );
}

// Aba Desafios do EAFIT Run: clubes (grupos com código de convite e ranking de km).
export default function RunClubs() {
  const toast = useToast();
  const [clubs, setClubs] = useState(null);
  const [mode, setMode] = useState(null); // null | 'join' | 'create'
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try { setClubs(await fetchClubs()); }
    catch (err) { console.error('RunClubs:', err); setClubs(c => c || []); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function submit(action, okMsg) {
    setBusy(true); setError('');
    try {
      await action();
      toast(okMsg);
      setMode(null); setCode(''); setName(''); setDescription('');
      await reload();
    } catch (err) {
      setError(clubError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleJoin() {
    const c = normalizeClubCode(code);
    if (c.length !== 6) { setError(t('O código do clube tem 6 letras e números.')); return; }
    submit(() => joinClub(c), t('🎉 Você entrou no clube!'));
  }

  function handleCreate() {
    if (name.trim().length < 3) { setError(t('O nome do clube precisa ter de 3 a 40 letras.')); return; }
    submit(() => createClub(name.trim(), description.trim()), t('🏁 Clube criado!'));
  }

  if (!clubs) return null;
  const full = clubs.length >= CLUB_LIMIT;

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Clubes de corrida')}</div>
      <div className="dash-card">
        {clubs.length === 0 && mode === null && (
          <p className="dash-empty">{t('Crie um clube para correr com o seu grupo, ou entre em um com o código: todos veem o ranking de km da semana e do mês.')}</p>
        )}
        {clubs.map(c => <ClubCard key={c.id} club={c} onChanged={reload} />)}

        {mode === null && (
          <div className="friends__actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={full} onClick={() => { setMode('create'); setError(''); }}>{t('Criar clube')}</button>
            <button type="button" className="btn btn--outline btn--sm" disabled={full} onClick={() => { setMode('join'); setError(''); }}>{t('Entrar com código')}</button>
          </div>
        )}
        {full && mode === null && <p className="profile-field__hint">{t('Você está no limite de {v1} clubes.', { v1: CLUB_LIMIT })}</p>}

        {mode === 'join' && (
          <div className="challenge__form">
            <input
              className="input input--sm" placeholder={t('Código do clube')} maxLength={12} autoCapitalize="characters"
              value={code} onChange={e => setCode(e.target.value)} aria-label={t('Código do clube')}
            />
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleJoin}>{busy ? t('Entrando…') : t('Entrar')}</button>
            <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => setMode(null)}>{t('Cancelar')}</button>
          </div>
        )}
        {mode === 'create' && (
          <div className="challenge__form">
            <input
              className="input input--sm" placeholder={t('Nome do clube')} maxLength={CLUB_NAME_MAX}
              value={name} onChange={e => setName(e.target.value)} aria-label={t('Nome do clube')}
            />
            <input
              className="input input--sm" placeholder={t('Descrição (opcional)')} maxLength={CLUB_DESC_MAX}
              value={description} onChange={e => setDescription(e.target.value)} aria-label={t('Descrição do clube')}
            />
            <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleCreate}>{busy ? t('Criando…') : t('Criar')}</button>
            <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => setMode(null)}>{t('Cancelar')}</button>
          </div>
        )}
        {error && <p className="profile-field__hint text-error" role="alert">{error}</p>}
        <p className="profile-field__hint">{t('Quem está no clube vê seu nome e seus km (corridas “só eu” não contam).')}</p>
      </div>
    </div>
  );
}
