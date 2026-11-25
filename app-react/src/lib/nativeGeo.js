import { registerPlugin } from '@capacitor/core';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

// Rastreio de GPS que segue com a tela apagada (serviço em primeiro plano no
// Android, com notificação fixa). Mesma forma do navegador: onPosition recebe
// { coords: { latitude, longitude, accuracy, altitude, altitudeAccuracy }, timestamp }
// e onError recebe { code } (1 = permissão negada, 2 = indisponível).
// Devolve uma função que para o rastreio.
export function watchNativePosition(onPosition, onError, { title, message } = {}) {
  let watcherId = null;
  let stopped = false;
  BackgroundGeolocation.addWatcher(
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
  ).then(id => {
    if (stopped) BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
    else watcherId = id;
  }).catch(() => { if (!stopped) onError({ code: 2 }); });

  return () => {
    stopped = true;
    if (watcherId !== null) BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
  };
}
