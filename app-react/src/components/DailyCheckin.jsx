import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { useBackToClose } from '../hooks/useBackToClose';
import { getModalRoot } from '../lib/modalRoot';
import { todayDate } from '../data/treinoData';
import { CHECKIN_FIELDS, fetchCheckins, saveCheckin, checkinTip } from '../lib/checkin';

import { t } from '../lib/i18n';

// Modal com as três escalas (energia, sono e humor de 1 a 5). Monta só quando
// aberto, então o "voltar" do aparelho fecha o modal e não sai do app.
function CheckinModal({ draft, setDraft, busy, onSave, onClose }) {
  useBackToClose(onClose);
  const complete = CHECKIN_FIELDS.every(({ key }) => draft[key]);

  return createPortal(
    <div className="rating-modal" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
      <div className="rating-modal__backdrop" onClick={busy ? undefined : onClose} />
      <div className="rating-modal__panel">
        <div className="rating-modal__header">
          <h3 className="rating-modal__title" id="checkin-title">{t('Como você está hoje?')}</h3>
          <button type="button" className="rating-modal__close" aria-label={t('Fechar')} disabled={busy} onClick={onClose}>✕</button>
        </div>
        {CHECKIN_FIELDS.map(({ key, label, low, high, emojis }) => (
          <div className="checkin__row" key={key}>
            <span className="checkin__label">{label}</span>
            <div className="checkin__scale-wrap">
              <div className="checkin__scale" role="radiogroup" aria-label={label}>
                {emojis.map((emoji, i) => {
                  const end = i === 0 ? low : i === emojis.length - 1 ? high : '';
                  return (
                    <button
                      key={i} type="button" role="radio" aria-checked={draft[key] === i + 1}
                      aria-label={end ? t('{label} {n} de 5 ({end})', { label, n: i + 1, end }) : t('{label} {n} de 5', { label, n: i + 1 })}
                      className={draft[key] === i + 1 ? 'checkin__opt checkin__opt--on' : 'checkin__opt'}
                      onClick={() => setDraft(d => ({ ...d, [key]: i + 1 }))}
                    >{emoji}</button>
                  );
                })}
              </div>
              <div className="checkin__ends" aria-hidden="true"><span>{low}</span><span>{high}</span></div>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn--primary btn--full" disabled={!complete || busy} onClick={onSave}>
          {busy ? t('Salvando…') : t('Registrar')}
        </button>
        <button type="button" className="btn btn--ghost btn--full" disabled={busy} onClick={onClose}>{t('Agora não')}</button>
      </div>
    </div>,
    getModalRoot()
  );
}

// Check-in de 3 toques do Treino: energia, sono e humor de 1 a 5, num modal que a
// pessoa abre quando quiser. Não abre sozinho: era a primeira coisa na frente do
// "Começar treino" todo dia. Na página fica só uma linha: "Fazer check-in" enquanto
// falta responder, e a dica do dia com "Refazer" depois.
// onChange recebe a resposta do dia (ou null) ao carregar e a cada envio.
export default function DailyCheckin({ onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    const today = todayDate();
    fetchCheckins(userId, today)
      .then(rows => {
        if (!active) return;
        const row = rows.find(r => r.checkin_date === today) || null;
        setSaved(row);
        onChange?.(row);
      })
      .catch(err => { console.error('fetchCheckins:', err); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
    // onChange é o setState da página (estável); a busca só depende de quem está logado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!userId || !loaded) return null;

  function openModal() {
    setDraft(saved ? { ...saved } : {});
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  async function handleSave() {
    setBusy(true);
    try {
      await saveCheckin(userId, todayDate(), draft);
      setSaved({ ...draft });
      onChange?.({ ...draft });
      setOpen(false);
      toast(t('✅ Check-in registrado'));
    } catch (err) {
      console.error('saveCheckin:', err);
      toast(t('❌ Não foi possível salvar o check-in'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {saved ? (
        <div className="checkin checkin--done" role="status">
          <span>{checkinTip(saved)}</span>
          <button type="button" className="btn btn--outline btn--sm" onClick={openModal}>{t('Refazer')}</button>
        </div>
      ) : (
        <div className="checkin checkin--done">
          <span>{t('🙂 Check-in de hoje')}</span>
          <button type="button" className="btn btn--outline btn--sm" onClick={openModal}>{t('Fazer check-in')}</button>
        </div>
      )}
      {open && (
        <CheckinModal draft={draft} setDraft={setDraft} busy={busy} onSave={handleSave} onClose={closeModal} />
      )}
    </>
  );
}
