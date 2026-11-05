import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ConfirmScheduleModal } from '../components/ConfirmScheduleModal';
import { DiscardScheduleDraftModal } from '../components/DiscardScheduleDraftModal';
import { ScheduleExportModal } from '../components/ScheduleExportModal';
import { ScheduleGrid } from '../components/ScheduleGrid';
import { scheduleDraftService, type ScheduleDetail } from '../services/scheduleDraftService';
import { scheduleService } from '../services/scheduleService';
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
  | { status: 'loaded'; schedule: ScheduleDetail | null }
  | { status: 'error' };

const VIEW_LABELS: Record<DraftViewName, string> = {
  clase: 'class',
  profesor: 'professor',
  colegio: 'school',
};

interface ScheduleDraftPageProps {
  /** Qué horario enseña: el borrador (`/horarios/borrador`) o el oficial vigente (`/horarios/oficial`). */
  which?: 'draft' | 'official';
}

/**
 * El horario borrador (`/horarios/borrador`, US-ALGO-VIEW) o el oficial (`/horarios/oficial`, US-ALGO-CONFIRM), para
 * `ADMIN` y `MEMBER`. Pide el horario una vez por visita (aunque `StrictMode` ejecute el efecto dos veces) y construye
 * en el navegador las tres vistas —por clase, por profesor y de un día de todo el colegio—, así que cambiar de vista o
 * de selección no hace peticiones. La vista y la selección viven en la dirección (solo ids), se derivan al pintar —un
 * valor que no está en el horario se ignora— y se escriben con `replace` para no llenar el historial. Un administrador
 * que mira el borrador puede confirmarlo como oficial o descartarlo, cada cosa con su diálogo; el oficial es de solo
 * lectura. Las rutas deben pasarle `key` para que cada una tenga su estado.
 */
export function ScheduleDraftPage({ which = 'draft' }: ScheduleDraftPageProps) {
  const { t, i18n } = useTranslation();
  const { authorizedFetch, state: session } = useSession();
  const isAdmin = session.status === 'authenticated' && session.data.user.role === 'ADMIN';
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<DraftState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // Cuándo se confirmó el oficial al que sustituiría la confirmación (para el aviso del diálogo).
  const [officialConfirmedAt, setOfficialConfirmedAt] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  // Para no actualizar nada tras desmontar y para pedir el borrador una vez por intento con StrictMode.
  const mounted = useRef(false);
  const requestedAttempt = useRef<number | undefined>(undefined);
  const requestedOverview = useRef(false);

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
    const request =
      which === 'draft'
        ? scheduleDraftService.getDraft(authorizedFetch)
        : scheduleDraftService.getOfficial(authorizedFetch);
    void request.then((outcome) => {
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
  }, [attempt, authorizedFetch, which]);

  // Solo quien puede confirmar el borrador necesita saber si ya hay un oficial al que sustituiría.
  useEffect(() => {
    if (which !== 'draft' || !isAdmin || requestedOverview.current) {
      return;
    }
    requestedOverview.current = true;
    void scheduleService.overview(authorizedFetch).then((outcome) => {
      if (mounted.current && outcome.status === 'loaded') {
        setOfficialConfirmedAt(outcome.overview.official?.confirmedAt ?? null);
      }
    });
  }, [which, isAdmin, authorizedFetch]);

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

  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  const generatedAt = schedule === null ? '' : dateOf(schedule.generatedAt);
  const isOfficial = which === 'official';
  const justConfirmed =
    isOfficial && (location.state as { notice?: string } | null)?.notice === 'confirmed';

  return (
    <Container as="main" className="py-5" data-testid="schedule-draft-page">
      <p className="mb-2">
        <Link to="/horarios">{t('schedule.draft.back')}</Link>
      </p>
      <h1 className="mb-2">{t(isOfficial ? 'schedule.official.title' : 'schedule.draft.title')}</h1>

      {justConfirmed && (
        <Alert variant="success" role="status">
          {t('schedule.confirm.done')}
        </Alert>
      )}

      {state.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('schedule.draft.loading')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t(isOfficial ? 'schedule.official.loadError' : 'schedule.draft.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('schedule.draft.retry')}
          </Button>
        </Alert>
      )}

      {state.status === 'loaded' && schedule === null && (
        <p>
          {t(isOfficial ? 'schedule.official.empty' : 'schedule.draft.empty')}{' '}
          <Link to="/horarios">
            {t(isOfficial ? 'schedule.official.emptyLink' : 'schedule.draft.emptyLink')}
          </Link>
        </p>
      )}

      {schedule !== null && index !== null && selection !== null && (
        <>
          {isOfficial ? (
            <p className="mb-3">
              <Badge bg="success" className="me-2">
                {t('schedule.official.badge')}
              </Badge>
              {schedule.confirmedAt !== null && schedule.confirmedBy !== null && (
                <>
                  <span className="text-body-secondary">
                    {t('schedule.official.confirmedBy', {
                      date: dateOf(schedule.confirmedAt),
                      name: `${schedule.confirmedBy.firstName} ${schedule.confirmedBy.lastName}`,
                    })}
                  </span>
                  <span className="text-body-secondary" aria-hidden="true">
                    {' · '}
                  </span>
                </>
              )}
              <span className="text-body-secondary">
                {t('schedule.official.generatedAt', { date: generatedAt })}
              </span>
            </p>
          ) : (
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
            </>
          )}

          <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
            <div
              role="group"
              aria-label={t('schedule.draft.views.label')}
              className="d-flex flex-wrap gap-2"
            >
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
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Button
                variant="outline-secondary"
                onClick={() => {
                  setExporting(true);
                }}
              >
                {t('schedule.export.button')}
              </Button>
              {!isOfficial && isAdmin && (
                <>
                  <Button
                    variant="success"
                    onClick={() => {
                      setConfirming(true);
                    }}
                  >
                    {t('schedule.confirm.button')}
                  </Button>
                  <Button
                    variant="outline-danger"
                    onClick={() => {
                      setDiscarding(true);
                    }}
                  >
                    {t('schedule.discard.button')}
                  </Button>
                </>
              )}
            </div>
          </div>
          <ScheduleExportModal
            show={exporting}
            onHide={() => {
              setExporting(false);
            }}
            index={index}
            initial={exportStart(selection)}
            selected={{ classId: selection.classId, professorId: selection.professorId }}
          />
          {!isOfficial && isAdmin && (
            <>
              <ConfirmScheduleModal
                show={confirming}
                scheduleId={schedule.id}
                officialConfirmedAt={officialConfirmedAt}
                index={index}
                onConfirmed={() => {
                  void navigate('/horarios/oficial', { state: { notice: 'confirmed' } });
                }}
                onHide={() => {
                  setConfirming(false);
                }}
              />
              <DiscardScheduleDraftModal
                show={discarding}
                scheduleId={schedule.id}
                onDiscarded={() => {
                  void navigate('/horarios', { state: { notice: 'discarded' } });
                }}
                onHide={() => {
                  setDiscarding(false);
                }}
              />
            </>
          )}

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

/** Con lo que arranca el diálogo de exportar: lo que se está viendo (en la vista del colegio, todas las clases). */
function exportStart(selection: DraftSelection): { kind: 'class' | 'professor'; target: string } {
  switch (selection.view) {
    case 'clase':
      return { kind: 'class', target: selection.classId ?? 'all' };
    case 'profesor':
      return { kind: 'professor', target: selection.professorId ?? 'all' };
    case 'colegio':
      return { kind: 'class', target: 'all' };
  }
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
}: SectionProps & { schedule: ScheduleDetail }) {
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
}: SectionProps & { schedule: ScheduleDetail }) {
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
