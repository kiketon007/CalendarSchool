import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { CourseWorkload } from '../services/courseWorkloadService';

interface WorkloadBalanceProps {
  workload: Pick<
    CourseWorkload,
    'calendar' | 'assignedSessions' | 'availableSessions' | 'warnings'
  >;
}

/**
 * Balance de la carga horaria de un curso (US19): cuántas sesiones a la semana están asignadas frente a las
 * del calendario del curso, con los avisos. **El balance es texto**: la barra es decorativa (`aria-hidden`) y
 * pasa al color de peligro cuando se supera, pero el color nunca es la única pista, porque el aviso lo dice con
 * palabras en una región `role="status"`. Sin calendario no hay con qué comparar: solo se dice lo asignado y se
 * avisa, con un enlace a los calendarios. Los textos se traducen por el código del aviso, que viene del
 * servidor. Lo reutilizará el listado de reglas (US20).
 */
export function WorkloadBalance({ workload }: WorkloadBalanceProps) {
  const { t } = useTranslation();
  const { assignedSessions, availableSessions, calendar, warnings } = workload;
  const exceeds = availableSessions !== null && assignedSessions > availableSessions;
  const percent =
    availableSessions === null || availableSessions === 0
      ? 0
      : Math.min(100, Math.round((assignedSessions / availableSessions) * 100));

  return (
    <section aria-labelledby="workload-balance-title" className="mb-4">
      <h2 id="workload-balance-title" className="visually-hidden">
        {t('workload.balanceLabel')}
      </h2>
      {availableSessions === null ? (
        <p className="mb-2">{t('workload.assignedOnly', { count: assignedSessions })}</p>
      ) : (
        <>
          <p className="mb-2">
            {t('workload.balance', { assigned: assignedSessions, available: availableSessions })}
          </p>
          <div aria-hidden="true" className="progress mb-3" style={{ height: '0.75rem' }}>
            <div
              className={`progress-bar${exceeds ? ' bg-danger' : ''}`}
              style={{ width: `${String(percent)}%` }}
            />
          </div>
        </>
      )}

      {warnings.length > 0 && (
        <div role="status" aria-label={t('workload.warnings.label')} className="d-grid gap-2">
          {warnings.map((warning) =>
            warning.code === 'WORKLOAD_EXCEEDS_SLOTS' ? (
              <p key={warning.code} className="alert alert-danger mb-0">
                {t('workload.warnings.WORKLOAD_EXCEEDS_SLOTS', {
                  excess: (warning.assigned ?? assignedSessions) - (warning.available ?? 0),
                  calendar: calendar?.name ?? '',
                })}
              </p>
            ) : (
              <p key={warning.code} className="alert alert-danger mb-0">
                {t('workload.warnings.COURSE_WITHOUT_CALENDAR')}{' '}
                <Link to="/calendarios" className="alert-link">
                  {t('workload.warnings.calendarsLink')}
                </Link>
              </p>
            ),
          )}
        </div>
      )}
    </section>
  );
}
