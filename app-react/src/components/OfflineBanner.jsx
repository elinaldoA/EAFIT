import { useConnection } from '../hooks/useConnection';
import { useWorkout } from '../context/useWorkout';
import { t } from '../lib/i18n';

// Faixa do treino ao vivo: avisa que o treino está sendo guardado no aparelho
// (sem rede) ou que há marcações esperando para subir. Some quando está tudo
// sincronizado — quem treina com tudo certo não vê nada.
export default function OfflineBanner() {
  const { online, pending } = useConnection();
  const { syncNow } = useWorkout();

  if (online && pending === 0) return null;

  const pendingText = pending > 0
    ? (pending === 1 ? t('1 alteração pendente') : t('{n} alterações pendentes', { n: pending }))
    : '';

  return (
    <div className={`live__net live__net--${online ? 'pending' : 'offline'}`} role="status" aria-live="polite">
      <span className="live__net-text">
        {online
          ? t('{pending} — seu treino está salvo no aparelho.', { pending: pendingText })
          : t('📴 Sem conexão — seu treino está sendo salvo no aparelho.')}
        {!online && pending > 0 && ` ${pendingText}.`}
      </span>
      {online && (
        <button type="button" className="live__net-btn" onClick={syncNow}>{t('Tentar agora')}</button>
      )}
    </div>
  );
}
