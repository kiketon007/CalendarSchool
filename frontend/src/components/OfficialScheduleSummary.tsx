import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ScheduleSummary } from '../services/scheduleService';

interface OfficialScheduleSummaryProps {
  /** Cómo va la lectura del resumen de los horarios del colegio. */
  state: 'loading' | 'loaded' | 'error';
  /** El oficial vigente, o `null` si no hay (solo con `state: 'loaded'`). */
  official: ScheduleSummary | null;
  /** Cuántos oficiales se sustituyeron (solo con `state: 'loaded'`): con alguno, enlaza a la lista. */
  previousCount: number;
  onRetry: () => void;
}

/**
 * El resumen del horario oficial arriba de «Generar horarios» (US-ALGO-CONFIRM), para los dos roles: cuándo y quién lo
 * confirmó y un enlace a `/horarios/oficial`, o que todavía no hay ninguno, y, si algún oficial se sustituyó, el
 * enlace «Horarios anteriores (N)» a `/horarios/anteriores` (US-ALGO-CONFIRM_b). Mientras carga no pinta nada y, si falla,
 * avisa con «Reintentar» sin impedir usar la comprobación ni el panel de la generación.
 */
export function OfficialScheduleSummary({
  state,
  official,
  previousCount,
  onRetry,
}: OfficialScheduleSummaryProps) {
  const { t, i18n } = useTranslation();

  if (state === 'loading') {
    return null;
  }
  if (state === 'error') {
    return (
      <Alert variant="warning" className="d-flex align-items-center gap-3">
        <span>{t('schedule.official.summary.loadError')}</span>
        <Button variant="outline-secondary" size="sm" onClick={onRetry}>
          {t('schedule.official.summary.retry')}
        </Button>
      </Alert>
    );
  }
  const previousLink = previousCount > 0 && (
    <Link to="/horarios/anteriores">
      {t('schedule.official.summary.previous', { count: previousCount })}
    </Link>
  );
  if (official === null || official.confirmedAt === null || official.confirmedBy === null) {
    return (
      <section
        aria-label={t('schedule.official.summary.title')}
        className="d-flex flex-wrap align-items-center gap-3 mb-4"
      >
        <p className="mb-0 text-body-secondary">{t('schedule.official.summary.none')}</p>
        {previousLink}
      </section>
    );
  }
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(official.confirmedAt));
  return (
    <section
      aria-label={t('schedule.official.summary.title')}
      className="d-flex flex-wrap align-items-center gap-3 mb-4"
    >
      <p className="mb-0 fw-semibold">
        {t('schedule.official.summary.confirmed', {
          date,
          name: `${official.confirmedBy.firstName} ${official.confirmedBy.lastName}`,
        })}
      </p>
      <Link to="/horarios/oficial">{t('schedule.official.summary.view')}</Link>
      {previousLink}
    </section>
  );
}
