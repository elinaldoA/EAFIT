import { useState } from 'react';
import { useToast } from '../../context/useToast';
import { addShoe, updateShoe, deleteShoe, shoeUsage, shoeWear, formatKm, SHOE_LIMIT_KM } from './runs';
import { t } from '../../lib/i18n';

// Escolha do tênis da corrida (fim da corrida e corrida lançada à mão).
export function ShoePicker({ shoes, value, onChange, id = 'runShoe' }) {
  const active = shoes.filter(s => !s.retired || s.id === value);
  if (!active.length) return null;
  return (
    <div className="profile-field">
      <span className="profile-field__label" id={`${id}Label`}>{t('Tênis')}</span>
      <div className="run-chips" role="group" aria-labelledby={`${id}Label`}>
        {active.map(s => (
          <button key={s.id} type="button" aria-pressed={value === s.id} className={`run-chip${value === s.id ? ' run-chip--on' : ''}`} onClick={() => onChange(value === s.id ? null : s.id)}>
            👟 {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// Aba Você: os tênis com os km rodados e o aviso de troca.
export default function RunShoes({ userId, shoes, runs, onChange }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [initialKm, setInitialKm] = useState('');
  const [limitKm, setLimitKm] = useState(String(SHOE_LIMIT_KM));
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const usage = shoeUsage(shoes, runs);
  const ordered = [...shoes].sort((a, b) => Number(a.retired) - Number(b.retired));

  async function run(action, done) {
    setBusy(true);
    try {
      await action();
      onChange();
      if (done) done();
    } catch (err) {
      console.error('RunShoes:', err);
      toast(t('⚠️ Não foi possível salvar — tente novamente'));
    } finally {
      setBusy(false);
    }
  }

  function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return toast(t('⚠️ Dê um nome ao tênis'));
    run(() => addShoe(userId, { name, initialKm, limitKm }), () => {
      setAdding(false); setName(''); setInitialKm(''); setLimitKm(String(SHOE_LIMIT_KM));
      toast(t('👟 Tênis adicionado'));
    });
  }

  return (
    <div className="section-group">
      <div className="section-group__label">{t('Tênis')}</div>
      {ordered.length > 0 && (
        <ul className="run-shoes">
          {ordered.map(s => {
            const m = usage[s.id] || 0;
            const wear = shoeWear(s, m);
            return (
              <li key={s.id} className={`dash-card run-shoe run-shoe--${s.retired ? 'retired' : wear}`}>
                <div className="run-shoe__head">
                  <strong>👟 {s.name}{s.retired ? ` · ${t('aposentado')}` : ''}</strong>
                  <span>{t('{v1} de {v2} km', { v1: formatKm(m, 0), v2: Math.round(s.limit_m / 1000) })}</span>
                </div>
                <div className="run-shoe__bar" role="img" aria-label={t('{v1}% da vida útil', { v1: Math.round((m / s.limit_m) * 100) })}>
                  <span style={{ width: `${Math.min(100, Math.round((m / s.limit_m) * 100))}%` }} />
                </div>
                {!s.retired && wear !== 'ok' && (
                  <p className="run-shoe__warn">{wear === 'over' ? t('Passou da vida útil: o amortecimento já não protege como antes.') : t('Perto do fim da vida útil: vá pensando no próximo par.')}</p>
                )}
                <div className="run-shoe__actions">
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => run(() => updateShoe(userId, s.id, { retired: !s.retired }))}>
                    {s.retired ? t('Voltar a usar') : t('Aposentar')}
                  </button>
                  <button
                    type="button" className="btn btn--ghost btn--sm" disabled={busy}
                    onClick={() => (confirmId === s.id ? run(() => deleteShoe(userId, s.id), () => setConfirmId(null)) : setConfirmId(s.id))}
                  >{confirmId === s.id ? t('Toque de novo para apagar') : t('Apagar')}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <form className="dash-card run-setup" onSubmit={handleAdd} aria-label={t('Novo tênis')}>
          <div className="profile-field">
            <label className="profile-field__label" htmlFor="shoeName">{t('Nome do tênis')}</label>
            <input id="shoeName" className="input" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder={t('Ex.: Azul de treino')} />
          </div>
          <div className="run-manual__row">
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="shoeInitial">{t('Já rodou (km)')}</label>
              <input id="shoeInitial" className="input" inputMode="decimal" value={initialKm} onChange={e => setInitialKm(e.target.value)} placeholder="0" />
            </div>
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="shoeLimit">{t('Vida útil (km)')}</label>
              <input id="shoeLimit" className="input" inputMode="numeric" value={limitKm} onChange={e => setLimitKm(e.target.value)} />
            </div>
          </div>
          <p className="profile-field__hint">{t('Tênis de corrida costuma durar de 500 a 800 km. O app avisa quando estiver perto.')}</p>
          <div className="run-setup__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)} disabled={busy}>{t('Cancelar')}</button>
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? t('Salvando…') : t('Adicionar tênis')}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(true)}>
          {shoes.length ? t('＋ Adicionar tênis') : t('👟 Cadastre seu tênis e acompanhe os km de cada par')}
        </button>
      )}
    </div>
  );
}
