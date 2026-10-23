import { useEffect, useRef, useState, type FormEvent } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { components } from '../api/generated/schema';
import type { CreateCalendarInput } from '../services/calendarsService';
import {
  generatePeriods,
  sessionNumbers,
  summaryOf,
  toClock,
  toMinutes,
} from '../utils/calendarPeriods';
import {
  MAX_BREAKS,
  MAX_PERIOD_MINUTES,
  MAX_SESSIONS,
  groupCalendarErrors,
  validateCalendar,
  type CalendarErrors,
  type DraftPeriod,
} from '../validation/calendarValidation';
import { MAX_COURSE_NAME, type FieldErrorCode } from '../validation/courseValidation';

type FieldError = components['schemas']['FieldError'];

const NAME_ID = 'calendar-name';
const NAME_ERROR_ID = 'calendar-name-error';
const PERIODS_ID = 'calendar-periods';
const COURSES_ID = 'calendar-courses';

/** Duración con la que se añade una sesión o un recreo a mano. */
const NEW_SESSION_MINUTES = 45;
const NEW_BREAK_MINUTES = 30;

/** Valores con los que empieza el bloque «Generar sesiones»: la jornada más común. */
const DEFAULT_GENERATOR = {
  start: '09:00',
  sessionCount: '6',
  duration: '45',
  withBreak: false,
  breakAfter: '3',
  breakDuration: '30',
};

/** Los cursos del colegio que se pueden marcar, tal como los cargó la página. */
export type CalendarCoursesState =
  | { status: 'loading' }
  | { status: 'loaded'; courses: { id: string; name: string }[] }
  | { status: 'error' };

/**
 * Qué hizo la página con los valores enviados. El formulario muestra el error que corresponda y deja
 * lo demás (navegar, renovar la sesión, volver a pedir los cursos) a la página.
 */
export type CalendarSubmitResult =
  /** Hecho, o sin nada que mostrar aquí (la página ya navegó o la sesión ya no es válida). */
  | { status: 'done' }
  /** El servidor rechaza campos concretos (`400`). */
  | { status: 'validationError'; details: FieldError[] }
  /** El nombre ya lo usa otro calendario del colegio (`409`). */
  | { status: 'nameTaken' }
  /** Fallo del servidor o de la red: aviso general, conservando lo escrito. */
  | { status: 'failed' };

interface CalendarFormProps {
  courses: CalendarCoursesState;
  /** Nombre del calendario que sigue hoy cada curso, por su `id`: los que siguen otro se avisan. */
  followedBy: Record<string, string>;
  onRetryCourses: () => void;
  /** Envía los valores ya validados en el cliente. */
  onSubmit: (values: CreateCalendarInput) => Promise<CalendarSubmitResult>;
  /** Texto del aviso general cuando `onSubmit` devuelve `failed`. */
  failureMessage: string;
}

/** Una fila de la tabla: la `key` la identifica aunque cambie su posición al quitar otras. */
interface PeriodRow extends DraftPeriod {
  key: number;
}

const NO_ERRORS: CalendarErrors = { rows: {}, courses: {} };

/** La jornada con la que empieza el formulario: las sesiones por defecto, con las `key` de la 1 en adelante. */
const INITIAL_ROWS: PeriodRow[] = generatePeriods({
  start: DEFAULT_GENERATOR.start,
  sessionCount: Number(DEFAULT_GENERATOR.sessionCount),
  duration: Number(DEFAULT_GENERATOR.duration),
  breakAfter: null,
  breakDuration: Number(DEFAULT_GENERATOR.breakDuration),
}).map((period, index) => ({ ...period, key: index + 1 }));

/** Un entero entre dos límites, o `null` si el texto no lo es. */
function integerBetween(text: string, min: number, max: number): number | null {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

/**
 * Formulario de un calendario base (US-BASE): el nombre, un bloque para generar las sesiones, la tabla de
 * periodos editable hora a hora y los cursos que lo siguen. Lo comparte la creación y, más adelante, la
 * edición. Valida con las mismas reglas que el backend antes de enviar, protege el envío con una guarda
 * síncrona contra la doble pulsación y muestra el error de cada campo bajo él, con el foco en el primero
 * inválido. Un fallo general conserva lo escrito. Empieza con la jornada por defecto ya generada (09:00, 6
 * sesiones de 45 minutos), así que solo falta el nombre.
 */
export function CalendarForm({
  courses,
  followedBy,
  onRetryCourses,
  onSubmit,
  failureMessage,
}: CalendarFormProps) {
  const { t, i18n } = useTranslation();
  const nextKey = useRef(INITIAL_ROWS.length + 1);
  const withKeys = (periods: DraftPeriod[]): PeriodRow[] =>
    periods.map((period) => ({ ...period, key: nextKey.current++ }));

  const [name, setName] = useState('');
  const [rows, setRows] = useState<PeriodRow[]>(INITIAL_ROWS);
  const [generator, setGenerator] = useState(DEFAULT_GENERATOR);
  const [generatorInvalid, setGeneratorInvalid] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<CalendarErrors>(NO_ERRORS);
  const [nameTaken, setNameTaken] = useState(false);
  const [generalError, setGeneralError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  // Guarda síncrona: dos pulsaciones seguidas pueden llegar antes de que React repinte el botón.
  const isSubmittingRef = useRef(false);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const numbers = sessionNumbers(rows);
  /** Número del recreo de una fila (1 el primero, 2 el segundo). */
  const breakNumbers = rows.reduce<number[]>((accumulated, row) => {
    const previous = accumulated[accumulated.length - 1] ?? 0;
    return [...accumulated, row.type === 'BREAK' ? previous + 1 : previous];
  }, []);
  const sessionTotal = numbers.filter((number) => number !== null).length;
  const breakTotal = rows.length - sessionTotal;
  const summary = summaryOf(rows);

  /** Texto del error de un campo; un código que la interfaz no conoce usa el texto genérico del grupo. */
  function errorText(group: 'name' | 'periods' | 'type' | 'time', code: FieldErrorCode) {
    const key = `calendars.form.errors.${group}.${code}`;
    return i18n.exists(key)
      ? t(key, { max: MAX_COURSE_NAME })
      : t(`calendars.form.errors.${group}.fallback`);
  }

  function focusFirstInvalid(details: FieldError[]) {
    const first = details[0];
    if (!first) {
      return;
    }
    const grouped = groupCalendarErrors([first]);
    let id: string | undefined;
    if (grouped.name) {
      id = NAME_ID;
    } else if (grouped.periods) {
      id = PERIODS_ID;
    } else if (Object.keys(grouped.courses).length > 0) {
      id = COURSES_ID;
    } else {
      const [index, row] = Object.entries(grouped.rows)[0] ?? [];
      const target = rows[Number(index)];
      id = target && row ? periodFieldId(target.key, row.endTime ? 'end' : 'start') : undefined;
    }
    if (id) {
      document.getElementById(id)?.focus();
    }
  }

  function clearPeriodErrors() {
    setErrors((current) => ({ ...current, periods: undefined, rows: {} }));
  }

  function changeRow(key: number, change: Partial<DraftPeriod>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
    setErrors((current) => {
      const index = rows.findIndex((row) => row.key === key);
      const rowErrors = current.rows[index];
      if (!rowErrors) {
        return current;
      }
      const cleared = { ...rowErrors };
      delete cleared.type;
      delete cleared.whole;
      if ('startTime' in change) {
        delete cleared.startTime;
      }
      if ('endTime' in change) {
        delete cleared.endTime;
      }
      return { ...current, rows: { ...current.rows, [index]: cleared } };
    });
  }

  function addPeriod(type: DraftPeriod['type']) {
    const last = rows[rows.length - 1];
    const start = last ? toMinutes(last.endTime) : null;
    const length = type === 'SESSION' ? NEW_SESSION_MINUTES : NEW_BREAK_MINUTES;
    setRows((current) => [
      ...current,
      {
        key: nextKey.current++,
        type,
        startTime: start === null ? '' : toClock(start),
        endTime: start === null ? '' : toClock(start + length),
      },
    ]);
    clearPeriodErrors();
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
    clearPeriodErrors();
  }

  function generate() {
    const sessionCount = integerBetween(generator.sessionCount, 1, MAX_SESSIONS);
    const duration = integerBetween(generator.duration, 1, MAX_PERIOD_MINUTES);
    const breakDuration = integerBetween(generator.breakDuration, 1, MAX_PERIOD_MINUTES);
    const breakAfter = integerBetween(
      generator.breakAfter,
      1,
      Math.max(1, (sessionCount ?? 2) - 1),
    );
    if (
      sessionCount === null ||
      duration === null ||
      toMinutes(generator.start) === null ||
      (generator.withBreak && (breakDuration === null || breakAfter === null || sessionCount < 2))
    ) {
      setGeneratorInvalid(true);
      return;
    }
    setGeneratorInvalid(false);
    setRows(
      withKeys(
        generatePeriods({
          start: generator.start,
          sessionCount,
          duration,
          breakAfter: generator.withBreak ? breakAfter : null,
          breakDuration: breakDuration ?? 30,
        }),
      ),
    );
    clearPeriodErrors();
  }

  function toggleCourse(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setErrors((current) => ({ ...current, courses: {} }));
  }

  /** Los cursos marcados que siguen existiendo, en el orden de la lista. */
  const availableCourses = courses.status === 'loaded' ? courses.courses : [];
  const chosenCourseIds = availableCourses.filter(({ id }) => selected.has(id)).map(({ id }) => id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setGeneralError(false);
    setNameTaken(false);

    const draft = {
      name,
      periods: rows.map(({ type, startTime, endTime }) => ({ type, startTime, endTime })),
      courseIds: chosenCourseIds,
    };
    const details = validateCalendar(draft);
    if (details.length > 0) {
      setErrors(groupCalendarErrors(details));
      isSubmittingRef.current = false;
      focusFirstInvalid(details);
      return;
    }
    setErrors(NO_ERRORS);

    setIsPending(true);
    const result = await onSubmit({
      name: draft.name,
      periods: draft.periods,
      courseIds: draft.courseIds,
    });
    isSubmittingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setIsPending(false);
    switch (result.status) {
      case 'validationError':
        setErrors(groupCalendarErrors(result.details));
        focusFirstInvalid(result.details);
        break;
      case 'nameTaken':
        setNameTaken(true);
        document.getElementById(NAME_ID)?.focus();
        break;
      case 'failed':
        setGeneralError(true);
        break;
      case 'done':
        break;
    }
  }

  const nameError = nameTaken
    ? t('calendars.form.errors.alreadyExists')
    : errors.name
      ? errorText('name', errors.name)
      : undefined;
  const hasCourseError = Object.keys(errors.courses).length > 0;

  return (
    <>
      {generalError && (
        <Alert variant="danger" role="alert">
          {failureMessage}
        </Alert>
      )}

      <Form noValidate onSubmit={(event) => void handleSubmit(event)}>
        <Form.Group className="mb-4" controlId={NAME_ID}>
          <Form.Label>{t('calendars.form.name')}</Form.Label>
          <Form.Control
            type="text"
            autoComplete="off"
            value={name}
            isInvalid={Boolean(nameError)}
            aria-invalid={Boolean(nameError)}
            aria-required="true"
            aria-describedby={nameError ? `${NAME_ID}-hint ${NAME_ERROR_ID}` : `${NAME_ID}-hint`}
            onChange={(event) => {
              setName(event.target.value);
              setNameTaken(false);
              setErrors((current) => ({ ...current, name: undefined }));
            }}
          />
          <Form.Text id={`${NAME_ID}-hint`} muted>
            {t('calendars.form.nameHint')}
          </Form.Text>
          {nameError && (
            <Form.Control.Feedback type="invalid" id={NAME_ERROR_ID} className="d-block">
              {nameError}
            </Form.Control.Feedback>
          )}
        </Form.Group>

        <fieldset className="mb-4" aria-describedby="calendar-generate-hint">
          <legend className="h5">{t('calendars.form.generate.legend')}</legend>
          <p id="calendar-generate-hint" className="text-body-secondary">
            {t('calendars.form.generate.hint')}
          </p>
          <div className="row g-3 align-items-end">
            <div className="col-6 col-md-3">
              <Form.Group controlId="calendar-generate-start">
                <Form.Label>{t('calendars.form.generate.start')}</Form.Label>
                <Form.Control
                  type="time"
                  value={generator.start}
                  onChange={(event) => {
                    setGenerator({ ...generator, start: event.target.value });
                  }}
                />
              </Form.Group>
            </div>
            <div className="col-6 col-md-3">
              <Form.Group controlId="calendar-generate-count">
                <Form.Label>{t('calendars.form.generate.sessionCount')}</Form.Label>
                <Form.Control
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_SESSIONS}
                  value={generator.sessionCount}
                  onChange={(event) => {
                    setGenerator({ ...generator, sessionCount: event.target.value });
                  }}
                />
              </Form.Group>
            </div>
            <div className="col-6 col-md-3">
              <Form.Group controlId="calendar-generate-duration">
                <Form.Label>{t('calendars.form.generate.duration')}</Form.Label>
                <Form.Control
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_PERIOD_MINUTES}
                  value={generator.duration}
                  onChange={(event) => {
                    setGenerator({ ...generator, duration: event.target.value });
                  }}
                />
              </Form.Group>
            </div>
            <div className="col-6 col-md-3">
              <Form.Check
                type="checkbox"
                id="calendar-generate-with-break"
                label={t('calendars.form.generate.withBreak')}
                checked={generator.withBreak}
                onChange={(event) => {
                  setGenerator({ ...generator, withBreak: event.target.checked });
                }}
              />
            </div>
            {generator.withBreak && (
              <>
                <div className="col-6 col-md-3">
                  <Form.Group controlId="calendar-generate-break-after">
                    <Form.Label>{t('calendars.form.generate.breakAfter')}</Form.Label>
                    <Form.Select
                      value={generator.breakAfter}
                      onChange={(event) => {
                        setGenerator({ ...generator, breakAfter: event.target.value });
                      }}
                    >
                      {Array.from(
                        {
                          length: Math.max(
                            1,
                            (integerBetween(generator.sessionCount, 1, MAX_SESSIONS) ?? 2) - 1,
                          ),
                        },
                        (_, index) => index + 1,
                      ).map((number) => (
                        <option key={number} value={String(number)}>
                          {number}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>
                <div className="col-6 col-md-3">
                  <Form.Group controlId="calendar-generate-break-duration">
                    <Form.Label>{t('calendars.form.generate.breakDuration')}</Form.Label>
                    <Form.Control
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_PERIOD_MINUTES}
                      value={generator.breakDuration}
                      onChange={(event) => {
                        setGenerator({ ...generator, breakDuration: event.target.value });
                      }}
                    />
                  </Form.Group>
                </div>
              </>
            )}
          </div>
          {generatorInvalid && (
            <Alert variant="warning" role="alert" className="mt-3 mb-0">
              {t('calendars.form.generate.invalid')}
            </Alert>
          )}
          <Button variant="outline-primary" className="mt-3" onClick={generate}>
            {t('calendars.form.generate.button')}
          </Button>
        </fieldset>

        <fieldset className="mb-4" aria-describedby="calendar-periods-hint">
          <legend id={PERIODS_ID} tabIndex={-1} className="h5">
            {t('calendars.form.periods.legend')}
          </legend>
          <p id="calendar-periods-hint" className="text-body-secondary">
            {t('calendars.form.periods.hint')}
          </p>
          {errors.periods && (
            <p className="text-danger" id="calendar-periods-error">
              {errorText('periods', errors.periods)}
            </p>
          )}

          {rows.map((row, index) => {
            const number = numbers[index];
            const breakNumber = breakNumbers[index] ?? 1;
            const isBreak = row.type === 'BREAK';
            const rowErrors = errors.rows[index];
            const typeErrorId = periodFieldId(row.key, 'type-error');
            const startErrorId = periodFieldId(row.key, 'start-error');
            const endErrorId = periodFieldId(row.key, 'end-error');
            const startError = rowErrors?.startTime;
            const endError = rowErrors?.endTime;
            const typeError = rowErrors?.type ?? rowErrors?.whole;
            const startDescribedBy =
              [typeError ? typeErrorId : '', startError ? startErrorId : '']
                .filter(Boolean)
                .join(' ') || undefined;
            return (
              <div
                key={row.key}
                role="group"
                aria-label={
                  isBreak
                    ? t('calendars.form.periods.break', { number: breakNumber })
                    : t('calendars.form.periods.session', { number })
                }
                className="border rounded p-3 mb-2"
              >
                <div className="row g-2 align-items-end">
                  <div className="col-12 col-md-3 fw-bold">
                    {isBreak
                      ? t('calendars.form.periods.break', { number: breakNumber })
                      : t('calendars.form.periods.session', { number })}
                  </div>
                  <div className="col-6 col-md-3">
                    <Form.Control
                      id={periodFieldId(row.key, 'start')}
                      type="time"
                      value={row.startTime}
                      aria-label={
                        isBreak
                          ? t('calendars.form.periods.breakStart', { number: breakNumber })
                          : t('calendars.form.periods.start', { number })
                      }
                      aria-invalid={Boolean(startError ?? typeError)}
                      aria-describedby={startDescribedBy}
                      isInvalid={Boolean(startError ?? typeError)}
                      onChange={(event) => {
                        changeRow(row.key, { startTime: event.target.value });
                      }}
                    />
                  </div>
                  <div className="col-6 col-md-3">
                    <Form.Control
                      id={periodFieldId(row.key, 'end')}
                      type="time"
                      value={row.endTime}
                      aria-label={
                        isBreak
                          ? t('calendars.form.periods.breakEnd', { number: breakNumber })
                          : t('calendars.form.periods.end', { number })
                      }
                      aria-invalid={Boolean(endError)}
                      aria-describedby={endError ? endErrorId : undefined}
                      isInvalid={Boolean(endError)}
                      onChange={(event) => {
                        changeRow(row.key, { endTime: event.target.value });
                      }}
                    />
                  </div>
                  {rows.length > 1 && (
                    <div className="col-12 col-md-3">
                      <Button
                        variant="outline-secondary"
                        aria-label={
                          isBreak
                            ? t('calendars.form.periods.removeBreak', { number: breakNumber })
                            : t('calendars.form.periods.removeSession', { number })
                        }
                        onClick={() => {
                          removeRow(row.key);
                        }}
                      >
                        {t('calendars.form.periods.remove')}
                      </Button>
                    </div>
                  )}
                </div>
                {typeError && (
                  <Form.Control.Feedback type="invalid" id={typeErrorId} className="d-block">
                    {errorText('type', typeError)}
                  </Form.Control.Feedback>
                )}
                {startError && (
                  <Form.Control.Feedback type="invalid" id={startErrorId} className="d-block">
                    {errorText('time', startError)}
                  </Form.Control.Feedback>
                )}
                {endError && (
                  <Form.Control.Feedback type="invalid" id={endErrorId} className="d-block">
                    {errorText('time', endError)}
                  </Form.Control.Feedback>
                )}
              </div>
            );
          })}

          <div className="d-flex flex-wrap gap-2 mb-2">
            <Button
              variant="outline-primary"
              disabled={sessionTotal >= MAX_SESSIONS}
              onClick={() => {
                addPeriod('SESSION');
              }}
            >
              {t('calendars.form.periods.addSession')}
            </Button>
            <Button
              variant="outline-primary"
              disabled={breakTotal >= MAX_BREAKS}
              onClick={() => {
                addPeriod('BREAK');
              }}
            >
              {t('calendars.form.periods.addBreak')}
            </Button>
          </div>
          <p className="text-body-secondary mb-0">
            {t('calendars.summary.sessions', { count: summary.sessionsPerDay })} ·{' '}
            {t('calendars.summary.week', { count: summary.sessionsPerWeek })} ·{' '}
            {t('calendars.summary.minutes', { count: summary.lectiveMinutes })}
          </p>
        </fieldset>

        <fieldset
          id={COURSES_ID}
          tabIndex={-1}
          className="mb-4"
          aria-describedby="calendar-courses-hint"
        >
          <legend className="h5">{t('calendars.form.courses.legend')}</legend>
          <p id="calendar-courses-hint" className="text-body-secondary">
            {t('calendars.form.courses.hint')}
          </p>

          {hasCourseError && (
            <Alert variant="warning" role="alert">
              {t('calendars.form.errors.course.NOT_FOUND')}
            </Alert>
          )}

          {courses.status === 'loading' && (
            <div role="status" className="d-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" aria-hidden="true" />
              <span>{t('calendars.form.courses.loading')}</span>
            </div>
          )}

          {courses.status === 'error' && (
            <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
              <span>{t('calendars.form.courses.loadError')}</span>
              <Button variant="outline-danger" size="sm" onClick={onRetryCourses}>
                {t('calendars.form.courses.retry')}
              </Button>
            </Alert>
          )}

          {courses.status === 'loaded' && courses.courses.length === 0 && (
            <p>
              {t('calendars.form.courses.none')}{' '}
              <Link to="/cursos/nuevo">{t('calendars.form.courses.createCourse')}</Link>
            </p>
          )}

          {availableCourses.map((course) => {
            const current = followedBy[course.id];
            const noteId = `calendar-course-${course.id}-note`;
            return (
              <div key={course.id} className="mb-2">
                <Form.Check
                  type="checkbox"
                  id={`calendar-course-${course.id}`}
                  label={course.name}
                  checked={selected.has(course.id)}
                  aria-describedby={current === undefined ? undefined : noteId}
                  onChange={() => {
                    toggleCourse(course.id);
                  }}
                />
                {current !== undefined && (
                  <Form.Text id={noteId} muted className="d-block ms-4">
                    {t('calendars.form.courses.willMove', { calendar: current })}
                  </Form.Text>
                )}
              </div>
            );
          })}
        </fieldset>

        <div className="d-flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? t('calendars.form.saving') : t('calendars.form.save')}
          </Button>
          <Link to="/calendarios" className="btn btn-outline-secondary">
            {t('calendars.form.cancel')}
          </Link>
        </div>
      </Form>
    </>
  );
}

/** Identificador de un campo de una fila de periodo (la `key` no cambia al quitar otras filas). */
function periodFieldId(
  key: number,
  part: 'start' | 'end' | 'type-error' | 'start-error' | 'end-error',
) {
  return `calendar-period-${String(key)}-${part}`;
}
