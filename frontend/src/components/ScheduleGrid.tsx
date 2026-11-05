import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { SUBJECT_COLOR_STYLES } from '../utils/subjectColors';
import type { DraftCell, DraftTable, ListedEntry } from '../utils/scheduleDraftViews';

interface ScheduleGridProps {
  /** Nombre de la tabla para las tecnologías de apoyo (un `caption`). */
  caption: string;
  table: DraftTable;
  /** Qué son las columnas: los días de la semana (su `id` es el número del día) o las clases (con su etiqueta). */
  columnKind: 'day' | 'class';
  /** Qué acompaña a la asignatura en cada celda: el profesor (vistas por clase y del colegio) o la clase (por profesor). */
  detail: 'professor' | 'class';
}

/** El profesor como «Apellidos, Nombre», igual que en los listados. */
const professorName = ({ firstName, lastName }: { firstName: string; lastName: string }) =>
  `${lastName}, ${firstName}`;

/**
 * La tabla del horario borrador (US-ALGO-VIEW), de **solo lectura**: las columnas son los días o las clases y las filas,
 * los periodos del calendario actual, con los recreos como separación. Cada celda lleva la asignatura con su color (el
 * del fondo; el nombre de la asignatura es la pista, así que el color nunca es la única), su código si lo tiene y el
 * profesor o la clase; una franja sin sesión dice «Libre». Por debajo de 768 px los días se abrevian (L, M, X, J, V) y
 * la tabla se desplaza dentro de su contenedor, nunca la página. Las entradas cuya sesión ya no existe en el calendario
 * se listan debajo.
 */
export function ScheduleGrid({ caption, table, columnKind, detail }: ScheduleGridProps) {
  const { t } = useTranslation();
  const wide = useMediaQuery('(min-width: 768px)');
  const outsideId = useId();
  const dayName = (day: string) => t(`slots.grid.days.${day}`);

  const detailOf = (cell: DraftCell) =>
    detail === 'professor'
      ? cell.professor === null
        ? t('schedule.draft.grid.noProfessor')
        : professorName(cell.professor)
      : t('schedule.draft.grid.classAt', { course: cell.courseName, class: cell.className });

  return (
    <>
      <div className="table-responsive mb-3">
        <table className="table table-bordered align-middle mb-0">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-start">
                <span className="visually-hidden">{t('schedule.draft.grid.sessionColumn')}</span>
              </th>
              {table.columns.map((column) => (
                <th scope="col" key={column.id} className="text-center px-1">
                  {columnKind === 'class' ? (
                    column.label
                  ) : wide ? (
                    dayName(column.id)
                  ) : (
                    <>
                      <span aria-hidden="true">{t(`slots.grid.daysShort.${column.id}`)}</span>
                      <span className="visually-hidden">{dayName(column.id)}</span>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) =>
              row.kind === 'BREAK' ? (
                <tr key={`break-${String(index)}`} className="table-secondary">
                  <td colSpan={table.columns.length + 1} className="small text-body-secondary">
                    {t('schedule.draft.grid.breakRow', { start: row.startTime, end: row.endTime })}
                  </td>
                </tr>
              ) : (
                <tr key={`session-${String(row.sessionNumber)}`}>
                  <th scope="row" className="text-nowrap small">
                    <span className="d-block">
                      {t('schedule.draft.grid.session', { number: row.sessionNumber })}
                    </span>
                    <span className="d-block fw-normal text-body-secondary">
                      {row.startTime}–{row.endTime}
                    </span>
                  </th>
                  {table.columns.map((column) => {
                    const cell = table.cells.get(`${column.id}:${String(row.sessionNumber)}`);
                    if (cell === undefined) {
                      return (
                        <td key={column.id} className="small text-body-secondary text-center">
                          {t('schedule.draft.grid.free')}
                        </td>
                      );
                    }
                    const { background, text } = SUBJECT_COLOR_STYLES[cell.subject.color];
                    return (
                      <td
                        key={column.id}
                        className="small p-1"
                        style={{ backgroundColor: background, color: text }}
                      >
                        <span className="d-block fw-semibold text-break">
                          {cell.subject.name}
                          {cell.subject.code !== null && (
                            <span className="fw-normal"> ({cell.subject.code})</span>
                          )}
                        </span>
                        <span
                          className={`d-block text-break${
                            detail === 'professor' && cell.professor === null ? ' fst-italic' : ''
                          }`}
                        >
                          {detailOf(cell)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {table.outside.length > 0 && (
        <section aria-labelledby={outsideId} className="mb-3">
          <h3 id={outsideId} className="h6">
            {t('schedule.draft.outside.title')}
          </h3>
          <p className="small text-body-secondary mb-1">{t('schedule.draft.outside.intro')}</p>
          <ul className="small mb-0">
            {table.outside.map((entry) => (
              <li
                key={`${String(entry.dayOfWeek)}-${String(entry.sessionNumber)}-${entry.className}-${entry.courseName}`}
              >
                {outsideText(entry, dayName(String(entry.dayOfWeek)), t)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** «Viernes 15:00–15:45 · Matemáticas · 1º Primaria A» (o con el profesor). */
function outsideText(
  entry: ListedEntry,
  day: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const who =
    entry.professor === null
      ? t('schedule.draft.grid.noProfessor')
      : professorName(entry.professor);
  return `${t('schedule.draft.entry', { day, start: entry.startTime, end: entry.endTime })} · ${entry.subject.name} · ${t('schedule.draft.grid.classAt', { course: entry.courseName, class: entry.className })} · ${who}`;
}
