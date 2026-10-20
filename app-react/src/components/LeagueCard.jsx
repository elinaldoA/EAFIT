import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../context/useToast';
import { DIVISIONS, MEDALS, fetchMyLeague, joinLeague, leaveLeague, monthLabel } from '../lib/league';
import { t } from '../lib/i18n';

// Liga do mês (Dashboard → Treinos). Some quando a liga está desligada no
// painel ou a função ainda não foi publicada.
export default function LeagueCard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try { setData(await fetchMyLeague()); } catch { setData({ enabled: false }); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function run(fn, msg) {
    setBusy(true);
    try { await fn(); toast(msg); await reload(); } catch { toast(t('Não foi possível concluir. Tente de novo.')); } finally { setBusy(false); }
  }

  if (!data?.enabled) return null;

  if (!data.member) {
    return (
      <div className="dash-card">
        <div className="dash-card__title">{t('🏅 Liga do mês')}</div>
        <p className="dash-empty">
          {t('Dispute com quem treina no mesmo ritmo que você: vence quem treinar mais dias no mês. Os 3 primeiros de cada divisão ganham medalha.')}
        </p>
        <p className="challenge__meta">{t('No ranking aparece só seu apelido ou primeiro nome.')}</p>
        <div className="challenge__actions">
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => run(joinLeague, t('🏅 Você entrou na liga!'))}>
            {t('Participar da liga')}
          </button>
        </div>
      </div>
    );
  }

  const div = DIVISIONS[data.division];
  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('🏅 Liga do mês')}</div>
      {div ? (
        <p className="challenge__meta">
          {t('Divisão {emoji} {division} · você em {position}º de {size} · {days} dia(s) no mês', {
            emoji: div.emoji, division: div.label, position: data.position, size: data.size, days: data.days,
          })}
        </p>
      ) : <p className="challenge__meta">{t('Admins não entram na classificação.')}</p>}
      {data.top?.length > 0 && (
        <ol className="challenge__board">
          {data.top.map((r, i) => (
            <li key={i} className={r.me ? 'challenge__row challenge__row--me' : 'challenge__row'}>
              <span>{MEDALS[r.position] || `${r.position}º`} {r.name}{r.me ? t('(você)') : ''}</span>
              <strong>{t('{n} dia(s)', { n: r.days })}</strong>
            </li>
          ))}
        </ol>
      )}
      {data.last && DIVISIONS[data.last.division] && (
        <p className="challenge__meta">
          {t('Mês passado ({month}): {position}º na divisão {division}', {
            month: monthLabel(data.last.month), position: data.last.position, division: DIVISIONS[data.last.division].label,
          })}
        </p>
      )}
      <p className="challenge__meta">{t('A divisão de cada mês sai dos dias treinados no mês anterior: Ouro 14+, Prata 8 a 13, Bronze o resto.')}</p>
      <div className="challenge__actions">
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
          onClick={() => window.confirm(t('Sair da liga? Você some do ranking deste mês.')) && run(leaveLeague, t('Você saiu da liga'))}>
          {t('Sair da liga')}
        </button>
      </div>
    </div>
  );
}
