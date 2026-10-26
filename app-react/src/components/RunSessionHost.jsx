import { useEffect, useRef, useState } from 'react';
import { useWorkout } from '../context/useWorkout';
import { useToast } from '../context/useToast';
import { useGeoTracker, geoSupported } from '../hooks/useGeoTracker';
import { useWakeLock } from '../hooks/useWakeLock';
import { useBackToClose } from '../hooks/useBackToClose';
import { useRunSession } from '../hooks/useRunSession';
import { setGps, notifyDistance } from '../lib/runSession';
import { readCardio, writeCardioField } from '../lib/cardio';

import { t } from '../lib/i18n';
function BackGuard({ onBlocked }) {
  useBackToClose(onBlocked);
  return null;
}

// Fica montado o tempo todo (dentro do WorkoutProvider) e cuida do que não
// pode parar quando a pessoa troca de aba ou fecha o modo treino durante uma
// corrida: o GPS, a tela acesa e a proteção contra sair/recarregar sem querer.
// A sessão é registrada pelo CardioRow (lib/runSession.js).
//
// - GPS: soma a distância no localStorage do item e salva em exercise_sets.
// - Tela acesa durante toda a corrida (com ou sem GPS).
// - "Voltar" (gesto/botão do Android) e fechar/recarregar a página pedem
//   confirmação em vez de sair; o aviso some ao pausar ou parar o cronômetro.
export default function RunSessionHost() {
  const { session } = useRunSession();
  const { saveSetState } = useWorkout();
  const toast = useToast();
  const [guardKey, setGuardKey] = useState(0);
  const saveTimer = useRef(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const running = !!session?.running;
  const gpsActive = running && !!session.gps && geoSupported();

  const geo = useGeoTracker({
    active: gpsActive,
    baseKm: session ? readCardio(session.nome).distancia : 0,
    onDistance: km => {
      const s = sessionRef.current;
      if (!s) return;
      writeCardioField(s.nome, 'distancia', String(km));
      notifyDistance();
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveSetState(s.dia, s.nome, 1, { distancia_km: km }), 800);
    },
  });

  useEffect(() => { setGps({ status: geo.status, accuracy: geo.accuracy }); }, [geo.status, geo.accuracy]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  useWakeLock(running);

  useEffect(() => {
    if (!running) return undefined;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  if (!running) return null;
  // Cada "voltar" consome a entrada do histórico do guarda; remontar (key) empilha
  // outra, então o app nunca chega ao fim do histórico enquanto a corrida roda.
  return (
    <BackGuard
      key={guardKey}
      onBlocked={() => {
        toast(t('🏃 Corrida em andamento — pause ou pare o cronômetro para sair'));
        setGuardKey(k => k + 1);
      }}
    />
  );
}
