import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { ScheduleGrid } from '../components/ScheduleGrid';
import { scheduleDraftService, type ScheduleDraft } from '../services/scheduleDraftService';
import { useSession } from '../session/SessionProvider';
import {
  DRAFT_VIEWS,
  paramsFromSelection,
  selectionFromParams,
  type DraftSelection,
  type DraftViewName,
} from '../utils/scheduleDraftParams';
import {
  WEEKDAYS,
  classView,
  indexDraft,
  professorView,
  schoolDayView,
  sessionsOfClass,
  sessionsOfProfessor,
  type DraftIndex,
  type ListedEntry,
} from '../utils/scheduleDraftViews';

type DraftState =
  | { status: 'loading' }
  | { status: 'loaded'; schedule: ScheduleDraft | null }
  | { status: 'error' };

const VIEW_LABELS: Record<DraftViewName, string> = {
  clase: 'class',
  profesor: 'professor',
  colegio: 'school',
};

/**
 * El horario borrador (`/horarios/borrador`, US-ALGO-VIEW), para `ADMIN` y `MEMBER`: solo lectura. Pide el borrador una
 * vez por visita (aunque `StrictMode` ejecute el efecto dos veces) y construye en el navegador las tres vistas —por
 * clase, por profesor y de un día de todo el colegio—, así que cambiar de vista o de selección no hace peticiones. La
 * vista y la selección viven en la dirección (solo ids), se derivan al pintar —un valor que no está en el borrador se
 * ignora— y se escriben con `replace` para no llenar el historial.
 */
export function ScheduleDraftPage() {
  const { t, i18n } = useTranslation();
  const { authorizedFetch } = useSession();
  const [state, setState] = useState<DraftState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [params, setParams] = useSearchParams();
  // Para no actualizar nada tras desmontar y para pedir el borrador una vez por intento con StrictMode.
  const mounted = useRef(false);
  const requestedAttempt = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (requestedAttempt.current === attempt) {
      return;
    }
    requestedAttempt.current = attempt;
    void scheduleDraftService.get(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setState({ status: 'loaded', schedule: outcome.schedule });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setState({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch]);

  function retry() {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  const schedule = state.status === 'loaded' ? state.schedule : null;
  const index = useMemo(() => (schedule === null ? null : indexDraft(schedule)), [schedule]);
  const selection = useMemo(
    () => (schedule === null ? null : selectionFromParams(params, schedule)),
    [params, schedule],
  );

  function select(change: Partial<DraftSelection>) {
    if (schedule === null || selection === null) {
      return;
    }
    setParams(paramsFromSelection({ ...selection, ...change }, schedule), { replace: true });
  }

  const generatedAt =
    schedule === null
      ? ''
      : new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(schedule.generatedAt),
        );

  return (
    <Container as="main" className="py-5" data-testid="schedule-draft-page">
      <p className="mb-2">
        <Link to="/horarios">{t('schedule.draft.back')}</Link>
      </p>
      <h1 className="mb-2">{t('schedule.draft.title')}</h1>

      {state.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('schedule.draft.loading')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('schedule.draft.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('schedule.draft.retry')}
          </Button>
        </Alert>
      )}

      {state.status === 'loaded' && schedule === null && (
        <p>
          {t('schedule.draft.empty')} <Link to="/horarios">{t('schedule.draft.emptyLink')}</Link>
        </p>
      )}

      {schedule !== null && index !== null && selection !== null && (
        <>
          <p className="mb-1">
            <Badge bg="warning" text="dark" className="me-2">
              {t('schedule.draft.badge')}
            </Badge>
            <span className="text-body-secondary">
              {t('schedule.draft.generatedAt', { date: generatedAt })}
            </span>
          </p>
          <p className="text-body-secondary mb-3">{t('schedule.draft.badgeNote')}</p>

          <ButtonGroup role="group" aria-label={t('schedule.draft.views.label')} className="mb-3">
            {DRAFT_VIEWS.map((view) => (
              <Button
                key={view}
                variant={selection.view === view ? 'primary' : 'outline-primary'}
                aria-pressed={selection.view === view}
                onClick={() => {
                  select({ view });
                }}
              >
                {t(`schedule.draft.views.${VIEW_LABELS[view]}`)}
              </Button>
            ))}
          </ButtonGroup>

          {selection.view === 'clase' && (
            <ClassSection schedule={schedule} index={index} selection={selection} select={select} />
          )}
          {selection.view === 'profesor' && (
            <ProfessorSection
              schedule={schedule}
              index={index}
              selection={selection}
              select={select}
            />
          )}
          {selection.view === 'colegio' && (
            <SchoolSection index={index} selection={selection} select={select} />
          )}
        </>
      )}
    </Container>
  );
}

interface SectionProps {
  index: DraftIndex;
  selection: DraftSelection;
  select: (change: Partial<DraftSelection>) => void;
}

/** Las sesiones guardadas de un curso sin calendario, por día y con las horas con las que se generaron. */
function ListedSessions({
  entries,
  title,
  intro,
}: {
  entries: ListedEntry[];
  title: string;
  intro: string;
}) {
  const { t } = useTranslation();
  return (
    <Alert variant="info" role="region" aria-label={title}>
      <p className="fw-semibold mb-1">{title}</p>
      <p className="mb-2">{intro}</p>
      <ul className="mb-0">
        {entries.map((entry) => (
          <li
            key={`${String(entry.dayOfWeek)}-${entry.startTime}-${entry.className}-${entry.courseName}`}
          >
            {t('schedule.draft.entry', {
              day: t(`slots.grid.days.${String(entry.dayOfWeek)}`),
              start: entry.startTime,
              end: entry.endTime,
            })}{' '}
            · {entry.subject.name}
            {' · '}
            {t('schedule.draft.grid.classAt', { course: entry.courseName, class: entry.className })}
            {entry.professor === null
              ? ` · ${t('schedule.draft.grid.noProfessor')}`
              : ` · ${entry.professor.lastName}, ${entry.professor.firstName}`}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function ClassSection({
  schedule,
  index,
  selection,
  select,
}: SectionProps & { schedule: ScheduleDraft }) {
  const { t } = useTranslation();
  if (selection.classId === null) {
    return <p>{t('schedule.draft.noClasses')}</p>;
  }
  const view = classView(index, selection.classId);
  const caption = t('schedule.draft.caption.class', {
    course: view.course.name,
    class: view.schoolClass.name,
  });

  return (
    <section aria-label={t('schedule.draft.views.class')}>
      <Form.Group controlId="draft-class" className="mb-3" style={{ maxWidth: '24rem' }}>
        <Form.Label>{t('schedule.draft.select.class')}</Form.Label>
        <Form.Select
          value={selection.classId}
          onChange={(event) => {
            select({ classId: event.target.value });
          }}
        >
          {schedule.courses
            .filter(({ classes }) => classes.length > 0)
            .map((course) => (
              <optgroup key={course.id} label={course.name}>
                {course.classes.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {course.name} {schoolClass.name}
                  </option>
                ))}
              </optgroup>
            ))}
        </Form.Select>
      </Form.Group>

      {view.kind === 'table' ? (
        <>
          <h2 className="h5">{caption}</h2>
          <ScheduleGrid caption={caption} table={view.table} columnKind="day" detail="professor" />
        </>
      ) : (
        <ListedSessions
          entries={view.entries}
          title={t('schedule.draft.withoutCalendar.title')}
          intro={t('schedule.draft.withoutCalendar.intro')}
        />
      )}
      <p className="text-body-secondary">
        {t('schedule.draft.sessionsPerWeek', { count: sessionsOfClass(index, selection.classId) })}
      </p>
    </section>
  );
}

function ProfessorSection({
  schedule,
  index,
  selection,
  select,
}: SectionProps & { schedule: ScheduleDraft }) {
  const { t } = useTranslation();
  if (selection.professorId === null) {
    return <p>{t('schedule.draft.noProfessors')}</p>;
  }
  const professor = index.professors.get(selection.professorId);
  const view = professorView(index, selection.professorId);
  const name = professor === undefined ? '' : `${professor.firstName} ${professor.lastName}`;

  return (
    <section aria-label={t('schedule.draft.views.professor')}>
      <Form.Group controlId="draft-professor" className="mb-3" style={{ maxWidth: '24rem' }}>
        <Form.Label>{t('schedule.draft.select.professor')}</Form.Label>
        <Form.Select
          value={selection.professorId}
          onChange={(event) => {
            select({ professorId: event.target.value });
          }}
        >
          {schedule.professors.map((item) => (
            <option key={item.id} value={item.id}>
              {item.lastName}, {item.firstName}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      {view.tables.map((table) => {
        const caption = t('schedule.draft.caption.professor', {
          professor: name,
          calendar: table.calendar?.name ?? '',
        });
        return (
          <div key={table.calendar?.id}>
            <h2 className="h5">{caption}</h2>
            <ScheduleGrid caption={caption} table={table} columnKind="day" detail="class" />
          </div>
        );
      })}
      {view.withoutCalendar.length > 0 && (
        <ListedSessions
          entries={view.withoutCalendar}
          title={t('schedule.draft.withoutCalendar.professorTitle')}
          intro={t('schedule.draft.withoutCalendar.intro')}
        />
      )}
      <p className="text-body-secondary">
        {t('schedule.draft.sessionsPerWeek', {
          count: sessionsOfProfessor(index, selection.professorId),
        })}
      </p>
    </section>
  );
}

function SchoolSection({ index, selection, select }: SectionProps) {
  const { t } = useTranslation();
  const view = schoolDayView(index, selection.day);
  const day = t(`slots.grid.days.${String(selection.day)}`);

  return (
    <section aria-label={t('schedule.draft.views.school')}>
      <Form.Group controlId="draft-day" className="mb-3" style={{ maxWidth: '24rem' }}>
        <Form.Label>{t('schedule.draft.select.day')}</Form.Label>
        <Form.Select
          value={String(selection.day)}
          onChange={(event) => {
            select({ day: Number(event.target.value) });
          }}
        >
          {WEEKDAYS.map((weekday) => (
            <option key={weekday} value={weekday}>
              {t(`slots.grid.days.${String(weekday)}`)}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      {view.tables.map((table) => {
        const caption = t('schedule.draft.caption.school', {
          day,
          calendar: table.calendar?.name ?? '',
        });
        return (
          <div key={table.calendar?.id}>
            <h2 className="h5">{caption}</h2>
            <ScheduleGrid caption={caption} table={table} columnKind="class" detail="professor" />
          </div>
        );
      })}
      {view.withoutCalendar.length > 0 && (
        <p className="text-body-secondary">
          {t('schedule.draft.withoutCalendar.courses', {
            courses: view.withoutCalendar.join(', '),
          })}
        </p>
      )}
    </section>
  );
}
