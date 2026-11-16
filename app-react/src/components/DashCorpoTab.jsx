import { useMemo } from 'react';
import { useAppConfig } from '../context/useAppConfig';
import { isFlagOn } from '../lib/appConfig';
import { fmtDate } from '../lib/utils';
import LineChart from './LineChart';
import ProgressPhotos from './ProgressPhotos';
import BodyMeasurements from './BodyMeasurements';
import CheckinInsights from './CheckinInsights';
import Skeleton from './Skeleton';
import { t, decimal } from '../lib/i18n';

// Aba "Corpo" da Evolução: peso, fotos de progresso, medidas e check-in diário.
export default function DashCorpoTab({ userId, workouts, weightLogs, loadingPR, profileWeight }) {
  const { config } = useAppConfig();
  const trainedDates = useMemo(() => workouts.filter(w => w.completed).map(w => w.workout_date), [workouts]);
  const weightPoints = useMemo(
    () => weightLogs.map(w => ({ label: fmtDate(w.log_date), value: w.peso })),
    [weightLogs]
  );
  return (
    <div className="section-group">
      <div className="section-group__label">{t('Peso e fotos de progresso')}</div>
      <div className="dash-card">
        <div className="dash-card__title">{t('Evolução do peso')}</div>
        <div className="line-chart-wrap">
          {loadingPR ? <Skeleton height={130} /> : (
            <LineChart
              points={weightPoints}
              valueSuffix="kg"
              singleMsg={v => t('1 registro: {v}kg — registre seu peso novamente em outro dia para ver a evolução', { v })}
              // Conta com peso no perfil e sem registro (cadastro de antes de o peso
              // inicial entrar no gráfico): "nenhum peso registrado" contradizia o Perfil.
              emptyMsg={profileWeight
                ? t('Peso atual: {v}kg. Cada vez que você atualizar o peso em Perfil › Meu corpo, ele entra neste gráfico.', { v: decimal(profileWeight) })
                : t('Nenhum peso registrado ainda. Registre em Perfil para começar.')}
            />
          )}
        </div>
      </div>
      {isFlagOn(config.flags, 'fotos_progresso') && (
        <div className="dash-card">
          <div className="dash-card__title">{t('Fotos de progresso')}</div>
          <ProgressPhotos />
        </div>
      )}
      {isFlagOn(config.flags, 'medidas_corporais') && <BodyMeasurements userId={userId} />}
      {isFlagOn(config.flags, 'checkin_diario') && <CheckinInsights userId={userId} trainedDates={trainedDates} />}
    </div>
  );
}
