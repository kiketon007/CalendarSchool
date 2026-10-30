import { useTranslation } from 'react-i18next';
import type { components } from '../api/generated/schema';

type CalendarPeriod = components['schemas']['CalendarPeriod'];

/** Una celda de la cuadrícula: un día (1, lunes, a 5) y el número de la sesión en la jornada. */
export type SlotGridCell = components['schemas']['SlotCell'];

interface SlotGridProps {
  /** El nombre accesible de la tabla (y su `caption`, solo para las tecnologías de apoyo). */
  caption: string;
  /** Los periodos de la jornada en orden: las sesiones son filas de botones y los recreos, separadores. */
  periods: readonly CalendarPeriod[];
  /** Las celdas marcadas. */
  cells: readonly SlotGridCell[];
  /** Con `false`, las celdas son texto y no hay cabeceras que marquen. */
  editable: boolean;
  /** La lista entera de celdas marcadas, ordenada por día y por sesión, tras cada cambio. */
  onChange?: (cells: SlotGridCell[]) => void;
}

const DAYS = [1, 2, 3, 4, 5] as const;

const keyOf = ({ dayOfWeek, sessionNumber }: SlotGridCell) =>
  `${String(dayOfWeek)}-${String(sessionNumber)}`;

const ordered = (cells: Iterable<SlotGridCell>): SlotGridCell[] =>
  [...cells].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.sessionNumber - b.sessionNumber);

/** El aspa con la que se distingue una celda marcada, que no depende del color. */
function CrossIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

/**
 * Cuadrícula de franjas de una asignatura en un curso (US19_c, reutilizable por las preferidas de US19_d):
 * una tabla con una columna por día de lunes a viernes y una fila por periodo de la jornada. Las **sesiones** son
 * filas con su número y sus horas, con un botón por día (`aria-pressed`, con el nombre «{día}, sesión {n}
 * ({inicio}–{fin})»); los **recreos** son filas de separación sin botones. Las cabeceras de día y de sesión son
 * botones que marcan toda su columna o su fila si falta alguna celda, y la desmarcan si ya estaba entera. Una
 * celda marcada se distingue por un aspa y un texto oculto, no solo por el color. Sin `editable`, las celdas son
 * texto. El componente no guarda estado: recibe las celdas marcadas y avisa de cada cambio con la lista entera.
 */
export function SlotGrid({ caption, periods, cells, editable, onChange }: SlotGridProps) {
  const { t } = useTranslation();
  const marked = new Set(cells.map(keyOf));

  // Los periodos con el número de sesión de cada sesión (los recreos no cuentan).
  const rows = periods.map((period, index) => ({
    ...period,
    number:
      period.type === 'SESSION'
        ? periods.slice(0, index + 1).filter(({ type }) => type === 'SESSION').length
        : 0,
  }));
  const sessionRows = rows.filter(({ type }) => type === 'SESSION');

  /** Marca las celdas dadas si falta alguna, y las desmarca si ya estaban todas. */
  function toggle(group: SlotGridCell[]) {
    const allMarked = group.every((slot) => marked.has(keyOf(slot)));
    const next = new Map(cells.map((slot) => [keyOf(slot), slot]));
    for (const slot of group) {
      if (allMarked) {
        next.delete(keyOf(slot));
      } else {
        next.set(keyOf(slot), slot);
      }
    }
    onChange?.(ordered(next.values()));
  }

  const dayName = (day: number) => t(`slots.grid.days.${String(day)}`);

  return (
    <table
      className="table table-bordered align-middle text-center slot-grid mb-3"
      aria-label={caption}
    >
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="text-start">
            {t('slots.grid.day')}
          </th>
          {DAYS.map((day) => (
            <th scope="col" key={day} className="px-1">
              {editable ? (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none fw-bold"
                  aria-label={t('slots.grid.selectDay', { day: dayName(day) })}
                  onClick={() => {
                    toggle(
                      sessionRows.map(({ number }) => ({ dayOfWeek: day, sessionNumber: number })),
                    );
                  }}
                >
                  <span aria-hidden="true" className="d-sm-none">
                    {t(`slots.grid.daysShort.${String(day)}`)}
                  </span>
                  <span aria-hidden="true" className="d-none d-sm-inline">
                    {dayName(day)}
                  </span>
                </button>
              ) : (
                <>
                  <span aria-hidden="true" className="d-sm-none">
                    {t(`slots.grid.daysShort.${String(day)}`)}
                  </span>
                  <span className="d-none d-sm-inline">{dayName(day)}</span>
                  <span className="visually-hidden d-sm-none">{dayName(day)}</span>
                </>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((period, index) =>
          period.type === 'BREAK' ? (
            <tr key={index} className="table-secondary">
              <td colSpan={DAYS.length + 1} className="small text-body-secondary">
                {t('slots.grid.break', { start: period.startTime, end: period.endTime })}
              </td>
            </tr>
          ) : (
            <tr key={index}>
              <th scope="row" className="text-start px-1 fw-normal">
                {editable ? (
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-start text-decoration-none"
                    aria-label={t('slots.grid.selectSession', { number: period.number })}
                    onClick={() => {
                      toggle(DAYS.map((day) => ({ dayOfWeek: day, sessionNumber: period.number })));
                    }}
                  >
                    <SessionLabel
                      number={period.number}
                      start={period.startTime}
                      end={period.endTime}
                    />
                  </button>
                ) : (
                  <SessionLabel
                    number={period.number}
                    start={period.startTime}
                    end={period.endTime}
                  />
                )}
              </th>
              {DAYS.map((day) => {
                const slot = { dayOfWeek: day, sessionNumber: period.number };
                const isMarked = marked.has(keyOf(slot));
                const mark = isMarked ? (
                  <>
                    <CrossIcon />
                    <span className="visually-hidden">{t('slots.grid.forbiddenMark')}</span>
                  </>
                ) : null;
                return (
                  <td key={day} className="p-1">
                    {editable ? (
                      <button
                        type="button"
                        className={`btn btn-sm w-100 ${isMarked ? 'btn-danger' : 'btn-outline-secondary'}`}
                        style={{ minHeight: '2.25rem' }}
                        aria-pressed={isMarked}
                        aria-label={t('slots.grid.cell', {
                          day: dayName(day),
                          number: period.number,
                          start: period.startTime,
                          end: period.endTime,
                        })}
                        onClick={() => {
                          toggle([slot]);
                        }}
                      >
                        {mark}
                      </button>
                    ) : (
                      <span className={isMarked ? 'text-danger-emphasis' : undefined}>{mark}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

/** El número de una sesión y sus horas, en dos líneas para que quepan a 360 px. */
function SessionLabel({ number, start, end }: { number: number; start: string; end: string }) {
  const { t } = useTranslation();
  return (
    <>
      <span className="d-block fw-semibold">{t('slots.grid.session', { number })}</span>
      <small className="d-block text-body-secondary">
        {t('slots.grid.sessionTimes', { start, end })}
      </small>
    </>
  );
}
