import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { SubjectColorSwatch } from '../components/SubjectColorSwatch';
import { WorkloadBalance } from '../components/WorkloadBalance';
import {
  courseWorkloadService,
  type CourseWorkload,
  type CourseWorkloadSubject,
  type WorkloadWarning,
} from '../services/courseWorkloadService';
import { useSession } from '../session/SessionProvider';
import {
  changesOf,
  draftBalance,
  draftFrom,
  rowWithSessions,
  rulesLostOf,
  type WorkloadBalanceData,
  type WorkloadDraft,
  type WorkloadDraftRow,
} from '../utils/courseWorkloadDraft';

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; workload: CourseWorkload }
  | { status: 'notFound' }
  | { status: 'error' };

type Notice = 'saved' | 'someGone' | 'forbidden' | 'saveError';

/** Opciones del selector de sesiones: «No se imparte» (vacío) y de 1 a 5. */
const SESSION_OPTIONS = [1, 2, 3, 4, 5] as const;
/** «Máximo al día»: vacío es «1 (por defecto)», sin regla, y de 2 a 5. */
const MAX_PER_DAY_OPTIONS = [2, 3, 4, 5] as const;
/** «Bloques»: vacío es «Sin bloques» y de 2 o 3 sesiones seguidas. */
const BLOCK_SIZE_OPTIONS = [2, 3] as const;

/**
 * Carga horaria de un curso (US19): cuelga de `AuthenticatedLayout` y la ven los dos roles. Pide la carga una
 * sola vez aunque `StrictMode` ejecute los efectos dos veces, con «Reintentar» si falla y la vista «no existe o
 * ya no está disponible» ante un `404`. Muestra el balance (`WorkloadBalance`) y, según el rol, **escritura solo
 * para `ADMIN`**: el administrador ve una matriz con todas las asignaturas del colegio y un selector de sesiones
 * por fila (el balance se recalcula mientras edita) y «Guardar», que solo se habilita con diferencias y envía
 * **solo las filas que cambian**, con una guarda síncrona contra el doble envío; el miembro ve lo que se imparte
 * en el curso como texto, sin editar. Con las reglas de reparto (US19_b), cada fila lleva además el máximo de
 * sesiones al día y el bloque, con los avisos de la asignatura recalculados al editar y el aviso de las reglas
 * que se perderían al dejar de impartirla. Con el `200` sigue en la página con la carga releída; un `400` con
 * `NOT_FOUND` (una asignatura se borró mientras se editaba) vuelve a pedirla y avisa; un `404` muestra la vista
 * de no disponible; un `403` y cualquier otro fallo, un aviso conservando lo editado. La decisión de permisos
 * es del backend: la interfaz solo oculta lo que no se podría guardar.
 */
export function CourseWorkloadPage() {
  const { t } = useTranslation();
  const { authorizedFetch, state } = useSession();
  const { id = '' } = useParams();
  const isAdmin = state.status === 'authenticated' && state.data.user.role === 'ADMIN';
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [draft, setDraft] = useState<WorkloadDraft>({});
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | undefined>(undefined);
  // Guarda síncrona: el estado `saving` tarda un render en reflejarse y una doble pulsación llegaría antes.
  const submitting = useRef(false);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto los efectos se ejecutan dos veces, pero cada intento se pide una vez.
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
    void courseWorkloadService.get(authorizedFetch, id).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setLoad({ status: 'loaded', workload: outcome.workload });
          setDraft(draftFrom(outcome.workload));
          break;
        case 'notFound':
          setLoad({ status: 'notFound' });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setLoad({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch, id]);

  function reload() {
    setLoad({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function retry() {
    setNotice(undefined);
    reload();
  }

  async function save(workload: CourseWorkload) {
    const changes = changesOf(workload, draft);
    if (submitting.current || changes.length === 0) {
      return;
    }
    submitting.current = true;
    setSaving(true);
    setNotice(undefined);
    try {
      const outcome = await courseWorkloadService.update(authorizedFetch, id, changes);
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'updated':
          setLoad({ status: 'loaded', workload: outcome.workload });
          setDraft(draftFrom(outcome.workload));
          setNotice('saved');
          break;
        case 'validationError':
          if (
            outcome.details.some(
              ({ field, code }) => field.endsWith('.subjectId') && code === 'NOT_FOUND',
            )
          ) {
            // Una asignatura se borró mientras se editaba: se vuelve a pedir la carga y se avisa.
            setNotice('someGone');
            reload();
          } else {
            setNotice('saveError');
          }
          break;
        case 'notFound':
          setLoad({ status: 'notFound' });
          break;
        case 'forbidden':
          setNotice('forbidden');
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setNotice('saveError');
          break;
      }
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  const loaded = load.status === 'loaded' ? load.workload : undefined;
  const changes = loaded ? changesOf(loaded, draft) : [];

  return (
    <Container as="main" className="py-5" data-testid="course-workload-page">
      {load.status === 'notFound' ? (
        <>
          <h1 tabIndex={-1}>{t('workload.notFound')}</h1>
          <Link to="/cursos">{t('workload.backToCourses')}</Link>
        </>
      ) : (
        <>
          <div className="mb-3">
            <Link to="/cursos">{t('workload.backToCourses')}</Link>
          </div>
          {loaded && (
            <h1 tabIndex={-1} className="mb-4">
              {t('workload.title', { course: loaded.course.name })}
            </h1>
          )}

          {(load.status === 'loading' || state.status !== 'authenticated') &&
            load.status !== 'error' && (
              <div role="status" className="d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span>{t('workload.loading')}</span>
              </div>
            )}

          {load.status === 'error' && (
            <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
              <span>{t('workload.loadError')}</span>
              <Button variant="outline-danger" size="sm" onClick={retry}>
                {t('workload.retry')}
              </Button>
            </Alert>
          )}

          {notice === 'saved' && loaded && (
            <Alert variant="success" role="status">
              {t('workload.saved', { course: loaded.course.name })}
            </Alert>
          )}
          {notice === 'someGone' && (
            <Alert variant="warning" role="alert">
              {t('workload.someGone')}
            </Alert>
          )}
          {notice === 'forbidden' && (
            <Alert variant="danger" role="alert">
              {t('workload.forbidden')}
            </Alert>
          )}
          {notice === 'saveError' && (
            <Alert variant="danger" role="alert">
              {t('workload.saveError')}
            </Alert>
          )}

          {loaded && state.status === 'authenticated' && (
            <>
              <WorkloadBalance workload={isAdmin ? draftBalance(loaded, draft) : loaded} />
              {isAdmin ? (
                <Matrix
                  workload={loaded}
                  draft={draft}
                  saving={saving}
                  canSave={changes.length > 0}
                  balance={draftBalance(loaded, draft)}
                  onChange={(subjectId, row) => {
                    setDraft((current) => ({ ...current, [subjectId]: row }));
                  }}
                  onSave={() => {
                    void save(loaded);
                  }}
                />
              ) : (
                <MemberList workload={loaded} />
              )}
            </>
          )}
        </>
      )}
    </Container>
  );
}

interface MatrixProps {
  workload: CourseWorkload;
  draft: WorkloadDraft;
  saving: boolean;
  canSave: boolean;
  /** El balance con el borrador, de donde salen los avisos de cada asignatura. */
  balance: WorkloadBalanceData;
  onChange: (subjectId: string, row: WorkloadDraftRow) => void;
  onSave: () => void;
}

/** La matriz del administrador: una fila por asignatura del colegio con su selector de sesiones y «Guardar». */
function Matrix({ workload, draft, saving, canSave, balance, onChange, onSave }: MatrixProps) {
  const { t } = useTranslation();

  if (workload.subjects.length === 0) {
    return (
      <div>
        <p className="fs-5 mb-1">{t('workload.noSubjects')}</p>
        <p className="text-body-secondary">{t('workload.noSubjectsHint')}</p>
        <Link to="/asignaturas/nueva" className="btn btn-primary">
          {t('workload.createSubject')}
        </Link>
      </div>
    );
  }

  return (
    <>
      <Table hover>
        <caption className="visually-hidden">
          {t('workload.matrix.caption', { course: workload.course.name })}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('workload.matrix.subject')}</th>
            <th scope="col">{t('workload.matrix.sessions')}</th>
            <th scope="col">{t('workload.matrix.rules')}</th>
          </tr>
        </thead>
        <tbody>
          {workload.subjects.map((subject) => (
            <MatrixRow
              key={subject.id}
              subject={subject}
              row={draft[subject.id] ?? emptyRow}
              rulesLost={rulesLostOf(workload, draft, subject.id)}
              warnings={balance.subjectWarnings[subject.id] ?? []}
              onChange={(row) => {
                onChange(subject.id, row);
              }}
            />
          ))}
        </tbody>
      </Table>
      <Button variant="primary" disabled={!canSave || saving} onClick={onSave}>
        {saving ? t('workload.saving') : t('workload.save')}
      </Button>
    </>
  );
}

const emptyRow: WorkloadDraftRow = { sessionsPerWeek: null, maxPerDay: null, blockSize: null };

/** El valor de un selector con «sin valor» vacío. */
const valueOf = (value: number | null) => (value === null ? '' : String(value));
const numberOf = (value: string) => (value === '' ? null : Number(value));

interface MatrixRowProps {
  subject: CourseWorkloadSubject;
  row: WorkloadDraftRow;
  /** Reglas que se borrarían al guardar si la asignatura deja de impartirse. */
  rulesLost: number;
  warnings: readonly WorkloadWarning[];
  onChange: (row: WorkloadDraftRow) => void;
}

/**
 * Una fila de la matriz: las sesiones y las dos reglas de reparto. Los dos selectores de reglas se desactivan
 * (y se vacían) con «No se imparte», y el aviso de pérdida se liga al selector de sesiones por
 * `aria-describedby`. A 360 px los tres selectores se apilan (`flex-wrap`).
 */
function MatrixRow({ subject, row, rulesLost, warnings, onChange }: MatrixRowProps) {
  const { t } = useTranslation();
  const taught = row.sessionsPerWeek !== null;
  const lostId = `workload-lost-${subject.id}`;

  return (
    <tr>
      <SubjectCell subject={subject} />
      <td>
        <Form.Select
          size="sm"
          aria-label={t('workload.matrix.select', { subject: subject.name })}
          aria-describedby={rulesLost > 0 ? lostId : undefined}
          value={valueOf(row.sessionsPerWeek)}
          onChange={(event) => {
            onChange(rowWithSessions(row, numberOf(event.target.value)));
          }}
        >
          <option value="">{t('workload.matrix.notTaught')}</option>
          {SESSION_OPTIONS.map((sessions) => (
            <option key={sessions} value={sessions}>
              {sessions}
            </option>
          ))}
        </Form.Select>
        {rulesLost > 0 && (
          <small id={lostId} className="d-block mt-1 text-danger-emphasis">
            {t('workload.matrix.loseRules', { count: rulesLost })}
          </small>
        )}
      </td>
      <td>
        <div className="d-flex flex-wrap gap-2">
          <div>
            <span className="d-block small text-body-secondary" aria-hidden="true">
              {t('workload.matrix.maxPerDay')}
            </span>
            <Form.Select
              size="sm"
              aria-label={t('workload.matrix.maxPerDaySelect', { subject: subject.name })}
              disabled={!taught}
              value={valueOf(row.maxPerDay)}
              onChange={(event) => {
                onChange({ ...row, maxPerDay: numberOf(event.target.value) });
              }}
            >
              <option value="">{t('workload.matrix.maxPerDayDefault')}</option>
              {MAX_PER_DAY_OPTIONS.map((max) => (
                <option key={max} value={max}>
                  {max}
                </option>
              ))}
            </Form.Select>
          </div>
          <div>
            <span className="d-block small text-body-secondary" aria-hidden="true">
              {t('workload.matrix.blockSize')}
            </span>
            <Form.Select
              size="sm"
              aria-label={t('workload.matrix.blockSizeSelect', { subject: subject.name })}
              disabled={!taught}
              value={valueOf(row.blockSize)}
              onChange={(event) => {
                onChange({ ...row, blockSize: numberOf(event.target.value) });
              }}
            >
              <option value="">{t('workload.matrix.noBlocks')}</option>
              {BLOCK_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {t('workload.matrix.blockOf', { count: size })}
                </option>
              ))}
            </Form.Select>
          </div>
        </div>
        <SubjectWarnings subject={subject.name} warnings={warnings} />
      </td>
    </tr>
  );
}

/** Los avisos de una asignatura en una región con nombre; sin avisos no se pinta nada. */
function SubjectWarnings({
  subject,
  warnings,
}: {
  subject: string;
  warnings: readonly WorkloadWarning[];
}) {
  const { t } = useTranslation();
  if (warnings.length === 0) {
    return null;
  }
  return (
    <div
      role="status"
      aria-label={t('workload.subjectWarnings.label', { subject })}
      className="mt-1 d-grid gap-1"
    >
      {warnings.map(({ code }) => (
        <small key={code} className="text-warning-emphasis">
          {t(`workload.subjectWarnings.${code as 'BLOCK_LARGER_THAN_LOAD'}`)}
        </small>
      ))}
    </div>
  );
}

/** La cabecera de una fila: el color con su nombre accesible, el nombre, el código y si está inactiva. */
function SubjectCell({ subject }: { subject: CourseWorkloadSubject }) {
  const { t } = useTranslation();
  return (
    <th scope="row" className="fw-normal">
      <div className="d-flex align-items-center gap-2">
        <SubjectColorSwatch color={subject.color} />
        <div>
          <span className="fw-semibold">{subject.name}</span>
          {subject.status === 'INACTIVE' && (
            <span className="badge text-bg-secondary ms-2">{t('workload.matrix.inactive')}</span>
          )}
          {subject.code !== null && (
            <small className="d-block text-body-secondary">
              {t('workload.matrix.code', { code: subject.code })}
            </small>
          )}
        </div>
      </div>
    </th>
  );
}

/** La vista del miembro: lo que se imparte en el curso, con sus sesiones, como texto y sin editar. */
function MemberList({ workload }: { workload: CourseWorkload }) {
  const { t } = useTranslation();
  const taught = workload.subjects.filter(({ sessionsPerWeek }) => sessionsPerWeek !== null);

  return (
    <>
      {taught.length === 0 ? (
        <p className="fs-5">{t('workload.member.empty')}</p>
      ) : (
        <ul
          aria-label={t('workload.member.list', { course: workload.course.name })}
          className="list-unstyled d-grid gap-2"
        >
          {taught.map((subject) => (
            <li key={subject.id} className="d-flex align-items-start gap-2">
              <SubjectColorSwatch color={subject.color} />
              <div>
                <span>
                  {[
                    t('workload.member.sessions', {
                      subject: subject.name,
                      count: subject.sessionsPerWeek ?? 0,
                    }),
                    ...(subject.maxPerDay === null
                      ? []
                      : [t('workload.member.maxPerDay', { count: subject.maxPerDay })]),
                    ...(subject.blockSize === null
                      ? []
                      : [t('workload.member.blockSize', { count: subject.blockSize })]),
                  ].join(' · ')}
                </span>
                <SubjectWarnings subject={subject.name} warnings={subject.warnings} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-body-secondary">{t('workload.forbidden')}</p>
    </>
  );
}
