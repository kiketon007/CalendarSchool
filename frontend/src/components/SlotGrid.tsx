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
  /**
   * Qué significa marcar: `forbidden` (por defecto) son franjas prohibidas y `preferred`, franjas preferidas, donde
   * las celdas de `blockedCells` están prohibidas y no se pueden marcar.
   */
  mode?: 'forbidden' | 'preferred';
  /** Solo en el modo `preferred`: las celdas prohibidas de la asignatura, que se ven pero no se marcan. */
  blockedCells?: readonly SlotGridCell[];
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

/** La marca de una celda preferida, que no depende del color. */
function CheckIcon() {
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
      strokeLinejoin="round"
    >
      <path d="M3 8.5l3.2 3.2L13 4.8" />
    </svg>
  );
}

/** La marca de una celda preferida que está prohibida y se ignora: un triángulo de aviso. */
function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2.2L14.2 13H1.8L8 2.2zM8 6.5v3M8 11.3v.1" />
    </svg>
  );
}

/**
 * Cuadrícula de franjas de una asignatura en un curso (US19_c, y las preferidas de US19_d con `mode="preferred"`):
 * una tabla con una columna por día de lunes a viernes y una fila por periodo de la jornada. Las **sesiones** son
 * filas con su número y sus horas, con un botón por día (`aria-pressed`, con el nombre «{día}, sesión {n}
 * ({inicio}–{fin})»); los **recreos** son filas de separación sin botones. Las cabeceras de día y de sesión son
 * botones que marcan toda su columna o su fila si falta alguna celda, y la desmarcan si ya estaba entera. Una
 * celda marcada se distingue por un aspa y un texto oculto, no solo por el color. Sin `editable`, las celdas son
 * texto. El componente no guarda estado: recibe las celdas marcadas y avisa de cada cambio con la lista entera.
 *
 * En el modo `preferred` las celdas de `blockedCells` (las prohibidas) se ven con el aspa y «Prohibida» y su botón
 * está deshabilitado con ese motivo en su nombre; una celda preferida que además está prohibida se ve con un
 * aviso («se ignora») y se puede desmarcar; y las cabeceras de día y de sesión solo marcan las celdas que no
 * están prohibidas (y se deshabilitan si no queda ninguna).
 */
export function SlotGrid({
  caption,
  periods,
  cells,
  editable,
  onChange,
  mode = 'forbidden',
  blockedCells = [],
}: SlotGridProps) {
  const { t } = useTranslation();
  const marked = new Set(cells.map(keyOf));
  const preferred = mode === 'preferred';
  const blocked = new Set(preferred ? blockedCells.map(keyOf) : []);
  /** Lo que una cabecera de día o de sesión puede marcar: en las preferidas, sin las celdas prohibidas. */
  const markable = (group: SlotGridCell[]) => group.filter((slot) => !blocked.has(keyOf(slot)));

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
    if (group.length === 0) {
      return;
    }
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
  const dayGroup = (day: number) =>
    markable(sessionRows.map(({ number }) => ({ dayOfWeek: day, sessionNumber: number })));
  const sessionGroup = (number: number) =>
    markable(DAYS.map((day) => ({ dayOfWeek: day, sessionNumber: number })));

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
                  aria-label={t(
                    preferred ? 'slots.grid.selectDayPreferred' : 'slots.grid.selectDay',
                    {
                      day: dayName(day),
                    },
                  )}
                  disabled={dayGroup(day).length === 0}
                  onClick={() => {
                    toggle(dayGroup(day));
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
                    aria-label={t(
                      preferred ? 'slots.grid.selectSessionPreferred' : 'slots.grid.selectSession',
                      { number: period.number },
                    )}
                    disabled={sessionGroup(period.number).length === 0}
                    onClick={() => {
                      toggle(sessionGroup(period.number));
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
                const isBlocked = blocked.has(keyOf(slot));
                // Una celda preferida que además está prohibida se ignora; una prohibida sin marcar solo se ve.
                const state = preferred
                  ? isBlocked
                    ? isMarked
                      ? 'ignored'
                      : 'forbidden'
                    : isMarked
                      ? 'preferred'
                      : 'free'
                  : isMarked
                    ? 'forbidden'
                    : 'free';
                const mark =
                  state === 'forbidden' ? (
                    <>
                      <CrossIcon />
                      <span className="visually-hidden">{t('slots.grid.forbiddenMark')}</span>
                    </>
                  ) : state === 'preferred' ? (
                    <>
                      <CheckIcon />
                      <span className="visually-hidden">{t('slots.grid.preferredMark')}</span>
                    </>
                  ) : state === 'ignored' ? (
                    <>
                      <WarningIcon />
                      <span className="visually-hidden">
                        {t('slots.grid.preferredForbiddenMark')}
                      </span>
                    </>
                  ) : null;
                const times = {
                  day: dayName(day),
                  number: period.number,
                  start: period.startTime,
                  end: period.endTime,
                };
                const buttonClass =
                  state === 'forbidden'
                    ? preferred
                      ? 'btn-outline-danger'
                      : 'btn-danger'
                    : state === 'preferred'
                      ? 'btn-success'
                      : state === 'ignored'
                        ? 'btn-warning'
                        : 'btn-outline-secondary';
                return (
                  <td key={day} className="p-1">
                    {editable ? (
                      <button
                        type="button"
                        className={`btn btn-sm w-100 ${buttonClass}`}
                        style={{ minHeight: '2.25rem' }}
                        aria-pressed={state === 'forbidden' && preferred ? undefined : isMarked}
                        aria-label={t(
                          state === 'forbidden' && preferred
                            ? 'slots.grid.cellForbidden'
                            : 'slots.grid.cell',
                          times,
                        )}
                        disabled={state === 'forbidden' && preferred}
                        onClick={() => {
                          toggle([slot]);
                        }}
                      >
                        {mark}
                      </button>
                    ) : (
                      <span
                        className={
                          state === 'forbidden'
                            ? 'text-danger-emphasis'
                            : state === 'ignored'
                              ? 'text-warning-emphasis'
                              : undefined
                        }
                      >
                        {mark}
                      </span>
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
