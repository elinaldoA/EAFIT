import { useState } from 'react';
import { decodeAnswers } from '../lib/parq';
import { fmtDate } from '../lib/utils';
import HealthForm from './HealthForm';
import HealthAlertNotice from './HealthAlertNotice';

import { t } from '../lib/i18n';
// Perfil → Saúde: refazer o PAR-Q e editar lesões, restrições e medicamentos.
export default function ProfileHealthSection({ user, updateProfile, toast }) {
  const meta = user.user_metadata || {};
  const [editing, setEditing] = useState(false);
  const answered = decodeAnswers(meta.parqAnswers).every(a => a !== null);

  if (editing) {
    return (
      <HealthForm
        meta={meta} updateProfile={updateProfile}
        onSaved={() => { setEditing(false); toast(t('✅ Respostas de saúde salvas')); }}
      />
    );
  }

  return (
    <>
      <p className="profile-field__hint">
        {answered && meta.parqAt
          ? t('PAR-Q respondido em {d}.', { d: fmtDate(String(meta.parqAt).slice(0, 10)) })
          : t('Você ainda não respondeu ao PAR-Q (7 perguntas sobre prontidão para atividade física).')}
      </p>
      {meta.parqAlert && <HealthAlertNotice />}
      {(meta.lesoes || meta.restricoes || meta.medicamentos) && (
        <p className="profile-field__hint">
          {[meta.lesoes && t('🦴 Lesões: {v}', { v: meta.lesoes }), meta.restricoes && t('⚠️ Restrições: {v}', { v: meta.restricoes }),
            meta.medicamentos && t('💊 Medicamentos: {v}', { v: meta.medicamentos })].filter(Boolean).join(' · ')}
        </p>
      )}
      <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(true)}>
        {answered ? t('Refazer o PAR-Q') : t('Responder o PAR-Q')}
      </button>
    </>
  );
}
