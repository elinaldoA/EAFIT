import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

// Rastreio de GPS que segue com a tela apagada (serviço em primeiro plano no
// Android, com notificação fixa). Mesma forma do navegador: onPosition recebe
// { coords: { latitude, longitude, accuracy, altitude, altitudeAccuracy }, timestamp }
// e onError recebe { code } (1 = permissão negada, 2 = indisponível).
// Devolve uma função que para o rastreio.
// Android 13+: a notificação fixa do serviço de GPS exige a permissão
// POST_NOTIFICATIONS em tempo de execução. Sem ela o rastreio continua, só não
// aparece o aviso. Pede uma vez; se já foi respondida, não pergunta de novo.
async function askNotificationPermission() {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
  } catch { /* sem o plugin ou recusado: o GPS segue sem a notificação */ }
}

export function watchNativePosition(onPosition, onError, { title, message } = {}) {
  let watcherId = null;
  let stopped = false;
  askNotificationPermission().then(() => (stopped ? null : BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: title || 'Corrida em andamento',
      backgroundMessage: message || 'O EAFIT está registrando o seu percurso.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 0,
    },
    (location, error) => {
      if (stopped) return;
      if (error) {
        onError({ code: error.code === 'NOT_AUTHORIZED' ? 1 : 2 });
        return;
      }
      if (!location) return;
      onPosition({
        coords: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          altitude: location.altitude,
          altitudeAccuracy: location.altitudeAccuracy,
        },
        timestamp: location.time,
      });
    },
  ))).then(id => {
    if (id == null) return;
    if (stopped) BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
    else watcherId = id;
  }).catch(() => { if (!stopped) onError({ code: 2 }); });

  return () => {
    stopped = true;
    if (watcherId !== null) BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
  };
}
