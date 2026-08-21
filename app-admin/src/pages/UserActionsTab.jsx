export default function UserActionsTab({
  detail, adminUser, busy, recoveryLink, isBanned, hasProfile,
  onRunAction, onToggleAdmin, onGeneratePlan,
}) {
  return (
    <div className="card stack">
      {recoveryLink && (
        <div className="field">
          <span className="field__label">Link de redefinição de senha (copie e envie ao usuário)</span>
          <input className="input" readOnly value={recoveryLink} onFocus={e => e.target.select()} />
        </div>
      )}

      <div className="actions-row">
        {isBanned ? (
          <button className="btn" disabled={busy} onClick={() => onRunAction('unban')}>Desbanir usuário</button>
        ) : (
          <button className="btn btn--danger" disabled={busy} onClick={() => onRunAction('ban', {}, 'Banir este usuário?')}>Banir usuário</button>
        )}
        <button className="btn" disabled={busy} onClick={() => onRunAction('resetPassword')}>Gerar link de redefinição de senha</button>
        {!detail.email_confirmed_at && (
          <button className="btn" disabled={busy} onClick={() => onRunAction('confirmUser', {}, 'Confirmar o e-mail deste usuário manualmente?')}>Confirmar e-mail</button>
        )}
        {detail.id !== adminUser?.id && (
          <button className="btn" disabled={busy} onClick={onToggleAdmin}>
            {detail.is_admin ? 'Remover admin' : 'Tornar admin'}
          </button>
        )}
        <button className="btn btn--danger" disabled={busy} onClick={() => onRunAction('deleteUser', {}, 'Excluir esta conta e todos os dados permanentemente?')}>
          Excluir conta
        </button>
      </div>

      <div>
        <h2 className="section-title">Gerar plano (suporte)</h2>
        {!hasProfile && <p className="form-msg">Este usuário ainda não completou peso/altura no perfil — não é possível gerar plano.</p>}
        <div className="actions-row">
          <button
            className="btn" disabled={busy || !hasProfile}
            onClick={() => onGeneratePlan('Isso cria um novo treino a partir do perfil atual do usuário e o ativa. O plano anterior continua salvo, só fica inativo. Continuar?')}
          >
            Gerar novo treino
          </button>
        </div>
      </div>
    </div>
  );
}
