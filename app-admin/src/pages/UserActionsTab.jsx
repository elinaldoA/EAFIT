import { formatDate } from '../lib/userDetailHelpers';

export default function UserActionsTab({
  detail, adminUser, busy, recoveryLink, isBanned, hasProfile,
  onRunAction, onToggleAdmin, onGeneratePlan, trainerCode, onToggleTrainer, onExportData,
  deactivation, onDeactivate,
}) {
  const isSelf = detail.id === adminUser?.id;

  return (
    <div className="card stack">
      {recoveryLink && (
        <div className="field">
          <span className="field__label">Link de redefinição de senha (copie e envie ao usuário)</span>
          <input className="input" readOnly value={recoveryLink} onFocus={e => e.target.select()} />
        </div>
      )}

      {deactivation && (
        <p className="form-msg">
          Conta desativada em {formatDate(deactivation.deactivated_at)}
          {deactivation.deactivated_by_email ? ` por ${deactivation.deactivated_by_email}` : ''}.
          {' '}Motivo: {deactivation.reason || 'não informado'}.
          {' '}O login está bloqueado e os dados continuam guardados.
        </p>
      )}

      <div className="actions-row">
        {deactivation ? (
          <button className="btn" disabled={busy} onClick={() => onRunAction('reactivate', {}, 'Reativar esta conta? O login volta a funcionar.')}>Reativar usuário</button>
        ) : isBanned ? (
          <button className="btn" disabled={busy} onClick={() => onRunAction('unban')}>Desbanir usuário</button>
        ) : (
          <>
            {!isSelf && <button className="btn btn--danger" disabled={busy} onClick={onDeactivate}>Desativar usuário</button>}
            <button className="btn btn--danger" disabled={busy} onClick={() => onRunAction('ban', {}, 'Banir este usuário?')}>Banir usuário</button>
          </>
        )}
        <button className="btn" disabled={busy} onClick={() => onRunAction('resetPassword')}>Gerar link de redefinição de senha</button>
        {!detail.email_confirmed_at && (
          <button className="btn" disabled={busy} onClick={() => onRunAction('confirmUser', {}, 'Confirmar o e-mail deste usuário manualmente?')}>Confirmar e-mail</button>
        )}
        {!isSelf && (
          <button className="btn" disabled={busy} onClick={onToggleAdmin}>
            {detail.is_admin ? 'Remover admin' : 'Tornar admin'}
          </button>
        )}
        <button className="btn" disabled={busy} onClick={onToggleTrainer}>
          {trainerCode ? `Remover personal (código ${trainerCode})` : 'Tornar personal trainer'}
        </button>
        <button className="btn btn--danger" disabled={busy} onClick={() => onRunAction('deleteUser', {}, 'Excluir esta conta e todos os dados permanentemente?')}>
          Excluir conta
        </button>
      </div>

      {onExportData && (
        <div>
          <h2 className="section-title">Dados do usuário (LGPD)</h2>
          <p className="user-detail__meta" style={{ margin: '0 0 10px' }}>
            Gera um arquivo JSON com tudo o que a conta guarda, para atender um pedido de acesso ou portabilidade.
            Contém dados pessoais e de saúde: envie só para o próprio titular.
          </p>
          <div className="actions-row">
            <button className="btn" disabled={busy} onClick={onExportData}>Baixar dados do usuário</button>
          </div>
        </div>
      )}

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
