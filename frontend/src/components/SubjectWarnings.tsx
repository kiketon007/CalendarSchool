import { useTranslation } from 'react-i18next';
import type { WorkloadWarning } from '../services/courseWorkloadService';

interface SubjectWarningsProps {
  /** El nombre de la asignatura, para el nombre accesible de la región. */
  subject: string;
  warnings: readonly WorkloadWarning[];
  /** Códigos que no se pintan aquí porque la pantalla ya los dice de otra forma. */
  omit?: readonly WorkloadWarning['code'][];
}

/**
 * Los avisos de una asignatura en un curso, en una región con nombre (`role="status"`, así que los cambios
 * mientras se edita se anuncian). Sin avisos no se pinta nada. Los textos se traducen por el código del aviso;
 * el de las celdas fuera del calendario lleva su recuento y concuerda en número.
 */
export function SubjectWarnings({ subject, warnings, omit = [] }: SubjectWarningsProps) {
  const { t } = useTranslation();
  const shown = warnings.filter(({ code }) => !omit.includes(code));
  if (shown.length === 0) {
    return null;
  }
  return (
    <div
      role="status"
      aria-label={t('workload.subjectWarnings.label', { subject })}
      className="mt-1 d-grid gap-1"
    >
      {shown.map((warning) => (
        <small key={warning.code} className="text-danger">
          {warning.code === 'SLOTS_OUTSIDE_CALENDAR'
            ? t('workload.subjectWarnings.SLOTS_OUTSIDE_CALENDAR', { count: warning.count ?? 0 })
            : t(`workload.subjectWarnings.${warning.code as 'BLOCK_LARGER_THAN_LOAD'}`)}
        </small>
      ))}
    </div>
  );
}
