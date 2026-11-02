import { useMemo, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Calendar } from '../services/calendarsService';
import type { ProfessorLoad, ProfessorLoadWarning } from '../services/professorsSummaryService';
import { cellStates, gridCellsOf, sessionsOf, type Interval } from '../utils/professorAvailability';
import { defaultLoadCalendar, lengthsByCourse } from '../utils/professorLoadDetail';
import { formatTeachingRange } from '../utils/teachingTime';
import { SlotGrid } from './SlotGrid';

/** Los calendarios del colegio, que el detalle usa para decir la duración de las sesiones de cada curso. */
export type CalendarsState =
  { status: 'loading' } | { status: 'loaded'; calendars: Calendar[] } | { status: 'error' };

/** Los tramos no disponibles del profesor, que la cuadrícula pinta sobre las sesiones del calendario elegido. */
export type AvailabilityState =
  { status: 'loading' } | { status: 'loaded'; intervals: Interval[] } | { status: 'error' };

interface ProfessorLoadDetailProps {
  /** Identificador de la región, al que apunta el `aria-controls` del botón que la despliega. */
  id: string;
  professor: ProfessorLoad;
  calendars: CalendarsState;
  availability: AvailabilityState;
  /** Se pulsó «Reintentar» tras un fallo al cargar los calendarios o la disponibilidad. */
  onRetry: () => void;
}

/**
 * El detalle de un profesor en el resumen de carga (US-PROF-SUMMARY_b): sus asignaciones con las sesiones y la
 * duración de las sesiones del calendario de cada curso, el desglose de su carga por calendario con el total y su
 * disponibilidad en una cuadrícula de solo lectura y sus avisos ampliados, cada uno con su explicación y un enlace a
 * lo que lo resuelve. Las asignaciones, el desglose y los avisos vienen en el resumen, así que se
 * ven sin esperar; solo la duración y la cuadrícula dependen de los calendarios y de la disponibilidad, y mientras
 * cargan, o si no se pueden cargar, cada asignación dice solo sus sesiones y la cuadrícula muestra el estado con su
 * «Reintentar», sin afectar al resto.
 */
export function ProfessorLoadDetail({
  id,
  professor,
  calendars,
  availability,
  onRetry,
}: ProfessorLoadDetailProps) {
  const { t } = useTranslation();
  const [chosenId, setChosenId] = useState<string | undefined>(undefined);
  const byCourse = useMemo(
    () => (calendars.status === 'loaded' ? lengthsByCourse(calendars.calendars) : undefined),
    [calendars],
  );
  const name = `${professor.lastName}, ${professor.firstName}`;

  // El calendario de la cuadrícula: el elegido o, al abrir, el de mayor carga.
  const entry =
    professor.calendars.find(({ calendar }) => calendar.id === chosenId) ??
    defaultLoadCalendar(professor.calendars);
  const calendar =
    calendars.status === 'loaded' && entry !== undefined
      ? calendars.calendars.find(({ id: calendarId }) => calendarId === entry.calendar.id)
      : undefined;
  const intervals = availability.status === 'loaded' ? availability.intervals : undefined;
  const grid = useMemo(() => {
    if (calendar === undefined || intervals === undefined) {
      return undefined;
    }
    return gridCellsOf(cellStates(intervals, sessionsOf(calendar.periods)));
  }, [calendar, intervals]);

  /** El calendario de un curso y la duración de sus sesiones, o `undefined` mientras no se sabe. */
  function calendarTextOf(courseId: string): string | undefined {
    if (byCourse === undefined) {
      return undefined;
    }
    const courseCalendar = byCourse.get(courseId);
    if (courseCalendar === undefined) {
      return t('professors.summary.detail.assignments.noCalendar');
    }
    const { calendarName, lengths } = courseCalendar;
    if (lengths === null) {
      return undefined;
    }
    return lengths.shortest === lengths.longest
      ? t('professors.summary.detail.assignments.withCalendarSame', {
          calendar: calendarName,
          length: lengths.shortest,
        })
      : t('professors.summary.detail.assignments.withCalendarRange', {
          calendar: calendarName,
          shortest: lengths.shortest,
          longest: lengths.longest,
        });
  }

  /** La explicación de un aviso y qué hacer: el texto va traducido por el código del servidor. */
  function warningTextOf(warning: ProfessorLoadWarning): string {
    switch (warning.code) {
      case 'EXCEEDS_MAX_HOURS':
      case 'MAY_EXCEED_MAX_HOURS':
        return t(`professors.summary.detail.warnings.${warning.code}`);
      case 'AVAILABILITY_INSUFFICIENT':
        return t('professors.summary.detail.warnings.AVAILABILITY_INSUFFICIENT', {
          calendar: warning.calendar?.name ?? '',
          count: warning.sessions ?? 0,
          available: warning.available ?? 0,
        });
      case 'COURSE_WITHOUT_CALENDAR':
        return t('professors.summary.detail.warnings.COURSE_WITHOUT_CALENDAR', {
          course: warning.course?.name ?? '',
          count: warning.assignmentCount ?? 0,
        });
      case 'SEVERAL_CALENDARS':
        return t('professors.summary.detail.warnings.SEVERAL_CALENDARS', {
          count: warning.calendarCount ?? 0,
        });
    }
  }

  /** Los enlaces a lo que resuelve cada aviso (el de varios calendarios no tiene: solo se explica). */
  function warningLinksOf(warning: ProfessorLoadWarning) {
    switch (warning.code) {
      case 'EXCEEDS_MAX_HOURS':
      case 'MAY_EXCEED_MAX_HOURS':
        return professor.courses.map((course) => (
          <Link key={course.id} to={`/cursos/${course.id}/profesores`}>
            {t('professors.summary.courseLink', { course: course.name })}
          </Link>
        ));
      case 'AVAILABILITY_INSUFFICIENT':
        return [
          <Link
            key="availability"
            to={`/profesores/${professor.id}/disponibilidad`}
            aria-label={t('professors.summary.editAvailabilityAria', { professor: name })}
          >
            {t('professors.summary.editAvailability')}
          </Link>,
        ];
      case 'COURSE_WITHOUT_CALENDAR':
        return [
          <Link key="calendars" to="/calendarios">
            {t('professors.summary.detail.warnings.calendarsLink')}
          </Link>,
        ];
      case 'SEVERAL_CALENDARS':
        return [];
    }
  }

  const loading = calendars.status === 'loading' || availability.status === 'loading';
  const failed =
    calendars.status === 'error' ||
    availability.status === 'error' ||
    (calendars.status === 'loaded' && entry !== undefined && calendar === undefined);

  return (
    <section
      id={id}
      aria-label={t('professors.summary.detail.title', { professor: name })}
      className="d-grid gap-3"
    >
      <div>
        <h3 className="h6">{t('professors.summary.detail.assignments.title')}</h3>
        <ul aria-label={t('professors.summary.detail.assignments.title')} className="mb-0">
          {professor.subjects.map((subject) => {
            const line = t('professors.summary.detail.assignments.line', {
              subject: subject.subjectName,
              course: subject.courseName,
              class: subject.className,
              count: subject.sessionsPerWeek,
            });
            const calendarText = calendarTextOf(subject.courseId);
            return (
              <li key={`${subject.subjectId}-${subject.classId}`}>
                {calendarText === undefined ? line : `${line} · ${calendarText}`}
              </li>
            );
          })}
        </ul>
      </div>

      {professor.calendars.length > 0 && (
        <div>
          <h3 className="h6">{t('professors.summary.detail.calendars.title')}</h3>
          <ul aria-label={t('professors.summary.detail.calendars.title')} className="mb-1">
            {professor.calendars.map((item) => (
              <li key={item.calendar.id}>
                {t('professors.summary.detail.calendars.line', {
                  calendar: item.calendar.name,
                  count: item.sessions,
                  available: item.available,
                  range: formatTeachingRange(item.minMinutes, item.maxMinutes),
                })}
              </li>
            ))}
          </ul>
          <p className="fw-semibold mb-0">
            {t('professors.summary.detail.calendars.total', {
              range: formatTeachingRange(professor.minMinutes, professor.maxMinutes),
            })}
          </p>
        </div>
      )}

      <div>
        <h3 className="h6">{t('professors.summary.detail.availability.title')}</h3>
        {entry === undefined ? (
          <p className="mb-0">{t('professors.summary.detail.availability.noCalendar')}</p>
        ) : (
          <>
            {professor.calendars.length > 1 && (
              <Form.Group className="mb-2" controlId={`${id}-calendar`}>
                <Form.Label>{t('professors.summary.detail.availability.calendar')}</Form.Label>
                <Form.Select
                  value={entry.calendar.id}
                  onChange={(event) => {
                    setChosenId(event.target.value);
                  }}
                >
                  {professor.calendars.map((item) => (
                    <option key={item.calendar.id} value={item.calendar.id}>
                      {item.calendar.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}

            {failed ? (
              <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
                <span>{t('professors.summary.detail.availability.loadError')}</span>
                <Button variant="outline-danger" size="sm" onClick={onRetry}>
                  {t('professors.summary.detail.availability.retry')}
                </Button>
              </Alert>
            ) : loading || grid === undefined || calendar === undefined ? (
              <div role="status">{t('professors.summary.detail.availability.loading')}</div>
            ) : (
              <>
                {grid.unavailableCells.length === 0 && grid.partialCells.length === 0 && (
                  <p className="mb-2">{t('professors.summary.detail.availability.always')}</p>
                )}
                <SlotGrid
                  caption={t('professors.summary.detail.availability.caption', {
                    name,
                    calendar: calendar.name,
                  })}
                  periods={calendar.periods}
                  cells={grid.unavailableCells}
                  partialCells={grid.partialCells}
                  editable={false}
                  mode="unavailable"
                />
              </>
            )}
          </>
        )}
      </div>

      {professor.warnings.length > 0 && (
        <div>
          <h3 className="h6">{t('professors.summary.detail.warnings.title')}</h3>
          <ul aria-label={t('professors.summary.detail.warnings.title')} className="mb-0">
            {professor.warnings.map((warning) => (
              <li key={[warning.code, warning.calendar?.id, warning.course?.id].join(':')}>
                <span>{warningTextOf(warning)}</span>{' '}
                <span className="d-inline-flex flex-wrap gap-2">{warningLinksOf(warning)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
