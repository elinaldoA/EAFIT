import { ghostGapS } from './ghost';
import { ghostName, gapText, ghostResultText } from './ghostText';
import { t } from '../../lib/i18n';

// Na tela da corrida: quanto você está à frente ou atrás da corrida anterior.
// Nos primeiros 100 m ainda não dá para comparar.
export default function GhostBar({ ghost, elapsedS, meters }) {
  const ready = meters >= 100;
  const gap = ready ? ghostGapS(ghost, elapsedS, meters) : 0;
  const state = !ready ? 'wait' : gap >= 2 ? 'ok' : gap <= -2 ? 'slow' : 'wait';
  return (
    <div className={`run-live__pace run-live__pace--${state}`} role="status">
      <span>{t('👻 {v1}', { v1: ghostName(ghost) })}</span>
      <strong>{ready ? gapText(gap) : t('medindo…')}</strong>
    </div>
  );
}

// No fim da corrida: o resultado contra o fantasma.
export function GhostResult({ ghost, totalS, meters }) {
  const text = ghostResultText(ghost, totalS, meters);
  return text ? <p className="run-live__ghost-result" role="status">{text}</p> : null;
}
