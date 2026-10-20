import { useEffect, useMemo, useState } from 'react';
import {
  fetchMyAmbassador, fetchMyAmbassadorChannels, fetchMyAmbassadorDaily,
  ambassadorLink, conversion, sourceLabel, shareAmbassadorLink, copyAmbassadorLink, AMBASSADOR_CHANNELS,
} from '../lib/ambassador';
import { qrSvgPath } from '../lib/qr';
import { shareInviteQr } from '../lib/shareCard';

import { t, locale } from '../lib/i18n';

const PERIODS = [
  { days: 7, label: () => t('7 dias') },
  { days: 30, label: () => t('30 dias') },
  { days: 90, label: () => t('90 dias') },
];

// Peças do painel do embaixador/influenciador, usadas no modo do programa
// (program/).

// Código, link e botões de compartilhar por canal.
export function AmbassadorLink({ amb, toast }) {
  async function handleShare(channel) {
    const result = await shareAmbassadorLink(amb.code, channel);
    if (result === 'copied') toast(t('🔗 Link copiado'));
    else if (result === 'failed') toast(t('⚠️ Não deu pra compartilhar. Copie o link acima'));
  }

  async function handleCopy() {
    toast(await copyAmbassadorLink(amb.code) ? t('🔗 Link copiado') : t('⚠️ Não deu pra copiar o link'));
  }

  return (
    <>
      {!amb.active && (
        <p className="amb__notice">{t('Seu link está pausado: novas visitas não contam até a equipe EAFIT reativar.')}</p>
      )}

      <div className="amb__link">
        <span className="amb__link-label">{t('Seu código')}: <strong>{amb.code}</strong></span>
        <code className="amb__link-url">{ambassadorLink(amb.code)}</code>
        <button type="button" className="btn btn--outline btn--sm" onClick={handleCopy}>{t('Copiar link')}</button>
      </div>

      <div className="amb__label">{t('Compartilhar no')}</div>
      <div className="amb__channels">
        {AMBASSADOR_CHANNELS.map(c => (
          <button key={c.key || 'outros'} type="button" className="btn btn--ghost btn--sm" disabled={!amb.active} onClick={() => handleShare(c.key)}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="amb__hint">{t('Use o botão do canal onde vai postar: assim você sabe de onde vem cada cadastro.')}</p>
    </>
  );
}

// QR Code do link (origem=qr) e a imagem pronta para baixar ou compartilhar
// (aba Divulgar do modo do programa).
export function AmbassadorQr({ amb, toast }) {
  const url = ambassadorLink(amb.code, 'qr');
  const qr = useMemo(() => qrSvgPath(url), [url]);
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await shareInviteQr(amb.code);
      if (result === 'downloaded') toast(t('🖼️ Imagem baixada'));
    } catch (err) {
      if (err?.name !== 'AbortError') toast(t('⚠️ Erro ao gerar imagem de compartilhamento'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="amb-qr">
      <svg className="amb-qr__code" viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} role="img" aria-label={t('QR Code do seu link')} shapeRendering="crispEdges">
        <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} fill="#fff" />
        <path d={qr.d} fill="#000" />
      </svg>
      <div className="amb-qr__side">
        <p className="amb__hint">{t('Quem aponta a câmera cai direto no seu link. Bom para a academia, eventos e vídeos.')}</p>
        <button type="button" className="btn btn--outline btn--sm" disabled={!amb.active || busy} onClick={handleShare}>
          {busy ? t('Gerando…') : t('Baixar imagem do QR')}
        </button>
      </div>
    </div>
  );
}

// Período, números, visitas por dia e tabela por canal.
export function AmbassadorResults({ initial }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState({ summary: initial, channels: null, daily: null });
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    Promise.all([fetchMyAmbassador(days), fetchMyAmbassadorChannels(days), fetchMyAmbassadorDaily(days)])
      .then(([summary, channels, daily]) => { if (active && summary) setData({ summary, channels, daily }); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [days]);

  const s = data.summary;
  const conv = conversion(s.visits, s.signups);

  return (
    <>
      <div className="recap__toggle amb__period" role="group" aria-label={t('Período')}>
        {PERIODS.map(p => (
          <button
            key={p.days} type="button" aria-pressed={days === p.days}
            className={`recap__btn${days === p.days ? ' recap__btn--active' : ''}`}
            onClick={() => setDays(p.days)}
          >
            {p.label()}
          </button>
        ))}
      </div>

      {error && <p className="amb__hint">{t('Não foi possível atualizar os números agora.')}</p>}

      <div className="stats-grid amb__stats">
        <div className="stat-card"><span className="stat-card__value">{s.visits}</span><span className="stat-card__label">{t('Visitas')}</span></div>
        <div className="stat-card"><span className="stat-card__value">{s.signups}</span><span className="stat-card__label">{t('Cadastros')}</span></div>
        <div className="stat-card"><span className="stat-card__value">{conv == null ? '—' : `${conv}%`}</span><span className="stat-card__label">{t('Conversão')}</span></div>
      </div>
      <div className="stats-grid amb__stats amb__stats--two">
        <div className="stat-card"><span className="stat-card__value">{s.total}</span><span className="stat-card__label">{t('Cadastros no total')}</span></div>
        <div className="stat-card"><span className="stat-card__value">{s.active7}</span><span className="stat-card__label">{t('Ativos na semana')}</span></div>
      </div>

      {data.daily && data.daily.length > 0 && <DailyBars daily={data.daily} />}

      {data.channels && data.channels.length > 0 && (
        <>
          <div className="amb__label">{t('Por canal')}</div>
          <table className="amb__table">
            <thead><tr><th>{t('Canal')}</th><th>{t('Visitas')}</th><th>{t('Cadastros')}</th></tr></thead>
            <tbody>
              {data.channels.map(c => (
                <tr key={c.source}><td>{sourceLabel(c.source)}</td><td>{c.visits}</td><td>{c.signups}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="amb__hint">
        {t('Visitas contam no máximo 1 vez por dia por pessoa. Quem abre seu link e cria conta em até 30 dias entra para você. Por privacidade, o painel mostra só números, não quem se cadastrou.')}
      </p>
    </>
  );
}

function DailyBars({ daily }) {
  const max = Math.max(1, ...daily.map(d => d.visits));
  const fmt = d => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  return (
    <>
      <div className="amb__label">{t('Visitas por dia')}</div>
      <div className="amb-bars" role="img" aria-label={t('Visitas e cadastros por dia no período')}>
        {daily.map(d => (
          <div
            key={d.day} className="amb-bars__col"
            title={t('{date}: {visits} visitas, {signups} cadastros', { date: fmt(d.day), visits: d.visits, signups: d.signups })}
          >
            <div className={`amb-bars__bar${d.signups ? ' amb-bars__bar--signup' : ''}`} style={{ height: `${Math.max(d.visits ? 4 : 0, (d.visits / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="amb-bars__legend">
        <span>{fmt(daily[0].day)}</span>
        <span><i className="amb-bars__dot" /> {t('dia com cadastro')}</span>
        <span>{t('Hoje')}</span>
      </div>
    </>
  );
}
