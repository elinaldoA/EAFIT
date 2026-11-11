import { t } from '../lib/i18n';
// Aviso mostrado quando alguma resposta do PAR-Q foi "sim". Orienta, não bloqueia.
export default function HealthAlertNotice() {
  return (
    <p className="health-alert" role="status">
      {t('⚠️ Alguma resposta indica que vale conversar com um médico antes de treinar mais forte. Você pode continuar usando o app, mas procure uma avaliação médica.')}
    </p>
  );
}
