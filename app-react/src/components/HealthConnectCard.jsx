import { useCallback, useEffect, useState } from 'react';
import { isNative } from '../lib/native';
import { getHealthState, connectHealth, openHealthSettings, readHealthSummary } from '../lib/nativeHealth';
import { t, locale, decimal } from '../lib/i18n';

// Health Connect no app Android, somente leitura: passos, frequência cardíaca e peso
// lidos no aparelho e mostrados aqui. Nada disso vai para o servidor.
export default function HealthConnectCard() {
  const [state, setState] = useState(null); // null carregando | 'unavailable' | 'off' | 'on'
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await readHealthSummary()); } catch { setData(null); }
  }, []);

  useEffect(() => {
    if (!isNative()) return undefined;
    let active = true;
    getHealthState().then(s => { if (active) { setState(s); if (s === 'on') load(); } });
    return () => { active = false; };
  }, [load]);

  if (!isNative() || state === null) return null;

  async function handleConnect() {
    setBusy(true);
    const s = await connectHealth();
    setState(s);
    if (s === 'on') await load();
    setBusy(false);
  }

  const n = v => Number(v).toLocaleString(locale);
  const weekday = iso => new Date(iso).toLocaleDateString(locale, { weekday: 'short' }).replace('.', '');
  const maxSteps = Math.max(1, ...(data?.days || []).map(d => d.steps));

  return (
    <div className="dash-card">
      <div className="dash-card__title">{t('Saúde (Health Connect)')}</div>
      {state === 'unavailable' && (
        <p className="dash-card__subtitle">{t('O Health Connect não está disponível neste aparelho. Instale ou atualize o app Health Connect na Play Store.')}</p>
      )}
      {state === 'off' && (
        <>
          <p className="dash-card__subtitle">{t('Conecte para ver seus passos, frequência cardíaca e peso aqui. O app só lê esses dados, no seu aparelho: nada é gravado no Health Connect nem enviado aos nossos servidores.')}</p>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={handleConnect}>
            {busy ? t('Conectando…') : t('Conectar Health Connect')}
          </button>
        </>
      )}
      {state === 'on' && (
        <>
          <div className="dash-stats-grid">
            <div className="stat-card">
              <span className="stat-card__icon">👟</span>
              <span className="stat-card__value">{data?.todaySteps == null ? '—' : n(data.todaySteps)}</span>
              <span className="stat-card__label">{t('Passos hoje')}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__icon">❤️</span>
              <span className="stat-card__value">{data?.heartRate ? data.heartRate.avg : '—'}</span>
              <span className="stat-card__label">{t('BPM médio hoje')}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__icon">⚖️</span>
              <span className="stat-card__value">{data?.weight ? `${decimal(data.weight.kg)}kg` : '—'}</span>
              <span className="stat-card__label">{t('Último peso')}</span>
            </div>
          </div>
          {data?.days?.length > 0 && (
            <div role="img" aria-label={t('Passos nos últimos 7 dias')} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 88, marginTop: 8 }}>
              {data.days.map(d => (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                  <div title={n(d.steps)} style={{ width: '100%', height: `${Math.max(4, (d.steps / maxSteps) * 100)}%`, minHeight: 3, background: 'var(--primary)', borderRadius: 4, opacity: 0.85 }} />
                  <span className="stat-card__label" style={{ textTransform: 'none' }}>{weekday(d.date)}</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={openHealthSettings}>
            {t('Gerenciar permissões')}
          </button>
        </>
      )}
    </div>
  );
}
