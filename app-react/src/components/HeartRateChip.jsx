import { useAuth } from '../context/useAuth';
import { useToast } from '../context/useToast';
import { useHeartRate } from '../hooks/useHeartRate';
import {
  isHeartRateSupported, connectHeartRate, disconnectHeartRate, friendlyHeartRateError, heartRateZone, maxHeartRate,
} from '../lib/heartRate';
import { trackFeature } from '../lib/tracking';

import { t } from '../lib/i18n';
// Batimento ao vivo no topo do modo treino. Sem Web Bluetooth (iPhone,
// Firefox) não aparece. Desconectado, é o botão de parear; conectado, mostra o
// bpm com a cor da zona e um toque desconecta (com confirmação).
export default function HeartRateChip() {
  const { user } = useAuth();
  const toast = useToast();
  const { status, bpm, deviceName } = useHeartRate();
  if (!isHeartRateSupported()) return null;

  async function handleConnect() {
    trackFeature('heart_rate');
    try {
      await connectHeartRate();
      toast(t('❤️ Cinta conectada'));
    } catch (err) {
      const kind = friendlyHeartRateError(err);
      if (kind === 'permission') toast(t('⚠️ Permita o Bluetooth para conectar a cinta'));
      else if (kind) toast(t('⚠️ Não foi possível conectar a cinta'));
    }
  }

  function handleClick() {
    if (status === 'connecting') return;
    if (status === 'on') {
      if (window.confirm(t('Desconectar {name}?', { name: deviceName || t('a cinta') }))) disconnectHeartRate();
      return;
    }
    handleConnect();
  }

  const zone = status === 'on' && bpm
    ? heartRateZone(bpm, maxHeartRate(user?.user_metadata?.idade || localStorage.getItem('profile_idade')))
    : null;
  let label = t('Conectar cinta cardíaca');
  if (status === 'on') label = t('{bpm} batimentos por minuto, zona {zone}', { bpm, zone });
  else if (status === 'lost') label = t('Cinta sem sinal — tocar para reconectar');

  return (
    <button
      type="button"
      className={`hr-chip hr-chip--${status}${zone ? ` hr-chip--z${zone}` : ''}`}
      aria-label={label} title={label}
      onClick={handleClick}
    >
      <span className="hr-chip__heart" aria-hidden="true">❤</span>
      {status === 'on' && bpm ? <span className="hr-chip__bpm">{bpm}</span> : null}
      {status === 'connecting' && <span className="hr-chip__bpm">…</span>}
      {status === 'lost' && <span className="hr-chip__bpm">--</span>}
    </button>
  );
}
