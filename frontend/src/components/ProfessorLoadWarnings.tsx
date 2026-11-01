import { useTranslation } from 'react-i18next';
import type { ProfessorLoadWarning } from '../services/professorsSummaryService';

interface ProfessorLoadWarningsProps {
  /** El nombre del profesor, para el nombre accesible de la región. */
  professor: string;
  warnings: readonly ProfessorLoadWarning[];
}

/** Los avisos que impiden o ponen en riesgo la generación van en rojo; el resto, atenuados. */
const RED = new Set<ProfessorLoadWarning['code']>([
  'EXCEEDS_MAX_HOURS',
  'AVAILABILITY_INSUFFICIENT',
]);
const AMBER = new Set<ProfessorLoadWarning['code']>([
  'MAY_EXCEED_MAX_HOURS',
  'COURSE_WITHOUT_CALENDAR',
]);

/**
 * Los avisos de la carga de un profesor (US-PROF-SUMMARY), en una región con nombre (`role="status"`). Sin avisos no
 * se pinta nada. Cada uno se dice con palabras: el color nunca es la única pista.
 */
export function ProfessorLoadWarnings({ professor, warnings }: ProfessorLoadWarningsProps) {
  const { t } = useTranslation();
  if (warnings.length === 0) {
    return null;
  }

  function textOf(warning: ProfessorLoadWarning): string {
    switch (warning.code) {
      case 'EXCEEDS_MAX_HOURS':
      case 'MAY_EXCEED_MAX_HOURS':
        return t(`professors.summary.warnings.${warning.code}`);
      case 'AVAILABILITY_INSUFFICIENT':
        return t('professors.summary.warnings.AVAILABILITY_INSUFFICIENT', {
          calendar: warning.calendar?.name ?? '',
          count: warning.sessions ?? 0,
          available: warning.available ?? 0,
        });
      case 'COURSE_WITHOUT_CALENDAR':
        return t('professors.summary.warnings.COURSE_WITHOUT_CALENDAR', {
          course: warning.course?.name ?? '',
          count: warning.assignmentCount ?? 0,
        });
      case 'SEVERAL_CALENDARS':
        return t('professors.summary.warnings.SEVERAL_CALENDARS', {
          count: warning.calendarCount ?? 0,
        });
    }
  }

  return (
    <div
      role="status"
      aria-label={t('professors.summary.warnings.label', { professor })}
      className="mt-1 d-grid gap-1"
    >
      {warnings.map((warning) => (
        <small
          key={[warning.code, warning.calendar?.id, warning.course?.id].join(':')}
          className={
            RED.has(warning.code)
              ? 'text-danger'
              : AMBER.has(warning.code)
                ? 'text-warning-emphasis'
                : 'text-body-secondary'
          }
        >
          {textOf(warning)}
        </small>
      ))}
    </div>
  );
}
