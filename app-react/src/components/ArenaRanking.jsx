import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../context/useToast';
import { MEDALS } from '../lib/league';
import {
  fetchArenaRanking, joinArenaRanking, leaveArenaRanking, seasonDaysLeft, shortDate,
} from '../lib/arena';
import { t } from '../lib/i18n';

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Ranking da temporada da EAFIT Arena. Vale para os dois módulos: o Geral soma o
// XP de treino, corrida e missões; o botão ao lado mostra só o XP do módulo
// (`sport`: 'gym' | 'run'). Só entra quem toca em "Participar do ranking".
// Some com a Arena desligada, sem a função publicada ou, no Run, com o módulo
// ainda não liberado.
export default function ArenaRanking({ sport }) {
  const toast = useToast();
  const [scope, setScope] = useState('all');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const reload = useCallback(async (next) => {
    try {
      const res = await fetchArenaRanking(next);
      if (alive.current) setData(res);
    } catch {
      if (alive.current) setData({ enabled: false });
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    reload(scope);
    return () => { alive.current = false; };
  }, [reload, scope]);

  async function run(fn, msg) {
    setBusy(true);
    try { await fn(); toast(msg); await reload(scope); } catch { toast(t('Não foi possível concluir. Tente de novo.')); } finally { if (alive.current) setBusy(false); }
  }

  if (!data?.enabled) return null;
  if (sport === 'run' && !data.run_released) return null;

  if (!data.season) {
    if (!data.next) return null;
    return (
      <div className="dash-card">
        <div className="dash-card__title">{t('🏆 Ranking da Arena')}</div>
        <p className="dash-empty">
          {t('{title} começa em {data}. Treine e corra para subir de nível até lá.', { title: data.next.title, data: shortDate(data.next.starts_on) })}
        </p>
      </div>
    );
  }

  const { season } = data;
  const left = seasonDaysLeft(season.ends_on, todayIso());
  const head = (
    <>
      <div className="dash-card__title">{t('🏆 {title}', { title: season.title })}</div>
      <p className="challenge__meta">
        {t('Até {data}', { data: shortDate(season.ends_on) })} · {left === 0 ? t('Último dia') : t('Faltam {n} dias', { n: left })}
      </p>
    </>
  );

  if (!data.member) {
    return (
      <div className="dash-card">
        {head}
        <p className="dash-empty">
          {t('Dispute com quem treina e corre: vence quem somar mais XP na temporada. Os 3 primeiros ganham medalha.')}
        </p>
        <p className="challenge__meta">{t('No ranking aparece só seu apelido ou primeiro nome.')}</p>
        <div className="challenge__actions">
          <button type="button" className="btn btn--primary btn--sm" disabled={busy}
            onClick={() => run(joinArenaRanking, t('🏆 Você entrou no ranking!'))}>
            {t('Participar do ranking')}
          </button>
        </div>
      </div>
    );
  }

  const sportLabel = sport === 'run' ? t('Run') : t('Gym');
  return (
    <div className="dash-card">
      {head}
      {sport && (
        <div className="challenge__actions" role="group" aria-label={t('Ranking')}>
          {[['all', t('Geral')], [sport, sportLabel]].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={scope === key}
              className={`btn btn--sm ${scope === key ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setScope(key)}>{label}</button>
          ))}
        </div>
      )}
      <p className="challenge__meta">
        {data.position
          ? t('Você em {position}º de {size} · {xp} XP', { position: data.position, size: data.size, xp: data.xp })
          : t('Ganhe XP na temporada para entrar no ranking.')}
      </p>
      {data.top?.length > 0 && (
        <ol className="challenge__board">
          {data.top.map((r, i) => (
            <li key={i} className={r.me ? 'challenge__row challenge__row--me' : 'challenge__row'}>
              <span>{MEDALS[r.position] || `${r.position}º`} {r.name}{r.me ? t('(você)') : ''}</span>
              <strong>{t('{xp} XP', { xp: r.xp })}</strong>
            </li>
          ))}
        </ol>
      )}
      {data.last && (
        <p className="challenge__meta">
          {t('Última temporada ({title}): {position}º com {xp} XP', { title: data.last.title, position: data.last.position, xp: data.last.xp })}
        </p>
      )}
      <p className="challenge__meta">{t('Conta o XP ganho dentro da temporada. Missões entram só no Geral.')}</p>
      <div className="challenge__actions">
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
          onClick={() => run(leaveArenaRanking, t('Você saiu do ranking'))}>
          {t('Sair do ranking')}
        </button>
      </div>
    </div>
  );
}

