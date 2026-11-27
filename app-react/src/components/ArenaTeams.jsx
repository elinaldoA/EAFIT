import { useEffect, useState } from 'react';
import { MEDALS } from '../lib/league';
import { fetchArenaTeams } from '../lib/arena';
import { t } from '../lib/i18n';

// Times da EAFIT Arena: o time do seu personal e os clubes de corrida de que você
// faz parte. O placar é a média de XP por participante na temporada, e só entra no
// ranking o time com participantes suficientes. Conta só quem entrou no ranking da
// Arena. Some sem times, sem temporada, sem ter entrado no ranking ou, no Run, com
// o módulo ainda não liberado.
export default function ArenaTeams({ sport }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchArenaTeams()
      .then(res => { if (alive) setData(res); })
      .catch(() => { if (alive) setData({ enabled: false }); });
    return () => { alive = false; };
  }, []);

  if (!data?.enabled || !data.member || !data.teams?.length) return null;
  if (sport === 'run' && !data.run_released) return null;

  return (
    <>
      {data.teams.map((team, i) => (
        <div className="dash-card" key={`${team.kind}-${i}`}>
          <div className="dash-card__title">
            {team.kind === 'club' ? t('🏃 Clube {name}', { name: team.name }) : t('👥 Time do personal {name}', { name: team.name })}
          </div>
          {team.listed ? (
            <>
              <p className="challenge__meta">
                {t('Seu time em {position}º de {size} · média de {avg} XP · {n} participantes', {
                  position: team.position, size: team.size, avg: team.avg, n: team.members,
                })}
              </p>
              <ol className="challenge__board">
                {team.top.map((r, j) => (
                  <li key={j} className={r.me ? 'challenge__row challenge__row--me' : 'challenge__row'}>
                    <span>{MEDALS[r.position] || `${r.position}º`} {r.name}{r.me ? t('(seu time)') : ''}</span>
                    <strong>{t('{avg} XP', { avg: r.avg })}</strong>
                  </li>
                ))}
              </ol>
            </>
          ) : team.members < team.min_team ? (
            <p className="dash-empty">
              {t('{n} no ranking da Arena. Com {min} participantes o time entra na disputa.', { n: team.members, min: team.min_team })}
            </p>
          ) : (
            <p className="dash-empty">{t('O time ainda não somou XP nesta temporada.')}</p>
          )}
          <p className="challenge__meta">
            {t('Vale a média de XP por participante, só de quem entrou no ranking da Arena.')}
          </p>
        </div>
      ))}
    </>
  );
}
