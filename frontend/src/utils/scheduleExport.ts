/**
 * Exportar el horario borrador (US-ALGO-VIEW_b): el documento Markdown o HTML de una clase, de un profesor o de todos,
 * construido en el navegador con las mismas tablas que se ven en pantalla.
 */

import type { TFunction } from 'i18next';
import {
  classView,
  professorView,
  sessionsOfClass,
  sessionsOfProfessor,
  type DraftCell,
  type DraftIndex,
  type DraftTable,
  type ListedEntry,
} from './scheduleDraftViews';
import { SUBJECT_COLOR_STYLES } from './subjectColors';

/** La fecha local de la generación como `AAAA-MM-DD`, para el nombre de los ficheros de «todos». */
export function dateStampOf(generatedAt: string): string {
  const date = new Date(generatedAt);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear())}-${month}-${day}`;
}

interface FileNameParts {
  /** El prefijo traducido (`horario`, `horarios-clases`…). */
  prefix: string;
  /** El nombre de la clase o del profesor, o `null` para «todos». */
  name: string | null;
  /** La fecha de generación (`AAAA-MM-DD`): va en el nombre de «todos» y cuando el nombre no deja nada que conservar. */
  date: string;
  extension: 'md' | 'html';
}

/** Minúsculas, sin tildes, `º`/`ª` como `o`/`a` y cualquier otra cosa como un solo guion, sin guiones en los extremos. */
function slugOf(name: string): string {
  return name
    .replaceAll('º', 'o')
    .replaceAll('ª', 'a')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

/** El nombre del fichero a descargar. Nunca lleva ids: si el nombre no deja nada, queda el prefijo con la fecha. */
export function fileNameOf({ prefix, name, date, extension }: FileNameParts): string {
  const slug = name === null ? '' : slugOf(name);
  return `${prefix}-${slug === '' ? date : slug}.${extension}`;
}

/** Los caracteres que Markdown (o la tabla) leería: se escapan con `\`. */
const MARKDOWN_SPECIAL = /[\\|*_`[\]<>]/gu;

/**
 * El texto de un nombre dentro de una celda o un título de Markdown: sin saltos de línea y con los caracteres
 * especiales escapados, para que no rompa la tabla ni se lea como formato o como HTML.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/\r\n|\r|\n/gu, ' ').replace(MARKDOWN_SPECIAL, (char) => `\\${char}`);
}

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** El texto dentro de HTML (contenido o atributo): los cinco caracteres que se leen como marcado, en una sola pasada. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (char) => HTML_ENTITIES[char] ?? char);
}

export type ExportFormat = 'markdown' | 'html';
export type ExportKind = 'class' | 'professor';

/** Una tabla del documento: su título (`caption`), su encabezado de calendario (solo en los profesores) y la tabla. */
export interface ExportPart {
  caption: string;
  heading: string | null;
  table: DraftTable;
  /** Qué acompaña a la asignatura en cada celda: el profesor (clases) o la clase (profesores). */
  detail: 'professor' | 'class';
}

/** Las sesiones que no caben en ninguna tabla porque su curso ya no tiene calendario. */
export interface ExportUnlisted {
  title: string;
  intro: string;
  entries: ListedEntry[];
}

/** El horario de una clase o de un profesor. `heading` es `null` si es el único del documento (su título es el del documento). */
export interface ExportSection {
  heading: string | null;
  sessionsPerWeek: string;
  parts: ExportPart[];
  unlisted: ExportUnlisted | null;
}

/** El contenido del documento, común a los dos formatos: cada uno solo decide cómo escribirlo. */
export interface ExportModel {
  title: string;
  generatedAt: string;
  sections: ExportSection[];
}

interface ExportRequest {
  index: DraftIndex;
  kind: ExportKind;
  /** El id de la clase o del profesor, o `all` para todos. */
  target: string;
  t: TFunction;
  /** El idioma de la interfaz, para la fecha. */
  locale: string;
}

type Section = Omit<ExportSection, 'heading'> & { heading: string };

function classSection({ index, t }: ExportRequest, classId: string): Section {
  const view = classView(index, classId);
  const name = `${view.course.name} ${view.schoolClass.name}`;
  const base = {
    heading: t('schedule.export.document.title', { name }),
    sessionsPerWeek: t('schedule.draft.sessionsPerWeek', {
      count: sessionsOfClass(index, classId),
    }),
  };
  if (view.kind === 'withoutCalendar') {
    return {
      ...base,
      parts: [],
      unlisted: {
        title: t('schedule.draft.withoutCalendar.title'),
        intro: t('schedule.draft.withoutCalendar.intro'),
        entries: view.entries,
      },
    };
  }
  const caption = t('schedule.draft.caption.class', {
    course: view.course.name,
    class: view.schoolClass.name,
  });
  return {
    ...base,
    parts: [{ caption, heading: null, table: view.table, detail: 'professor' }],
    unlisted: null,
  };
}

function professorSection({ index, t }: ExportRequest, professorId: string): Section {
  const professor = index.professors.get(professorId);
  if (professor === undefined) {
    throw new Error(`El profesor ${professorId} no está en el borrador`);
  }
  const name = `${professor.lastName}, ${professor.firstName}`;
  const view = professorView(index, professorId);
  return {
    heading: t('schedule.export.document.title', { name }),
    sessionsPerWeek: t('schedule.draft.sessionsPerWeek', {
      count: sessionsOfProfessor(index, professorId),
    }),
    parts: view.tables.map((table) => {
      const calendar = table.calendar?.name ?? '';
      return {
        caption: t('schedule.draft.caption.professor', { professor: name, calendar }),
        heading: t('schedule.export.document.calendar', { calendar }),
        table,
        detail: 'class',
      };
    }),
    unlisted:
      view.withoutCalendar.length === 0
        ? null
        : {
            title: t('schedule.draft.withoutCalendar.professorTitle'),
            intro: t('schedule.draft.withoutCalendar.intro'),
            entries: view.withoutCalendar,
          },
  };
}

/**
 * Arma el contenido del documento a partir de las mismas vistas que se ven en pantalla (`classView` y
 * `professorView`), de modo que lo exportado y lo visto no pueden diferir. Un solo horario es el título del documento;
 * varios, un apartado cada uno. Las entradas sin profesor no salen en ningún profesor, como en pantalla.
 */
export function buildExportModel(request: ExportRequest): ExportModel {
  const { index, kind, target, t, locale } = request;
  const all = target === 'all';
  const ids =
    kind === 'class'
      ? [...index.classes.keys()]
      : index.draft.professors.map((professor) => professor.id);
  const selected = all ? ids : [target];
  const sections = selected.map((id) =>
    kind === 'class' ? classSection(request, id) : professorSection(request, id),
  );
  const format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  // Un oficial dice cuándo se confirmó (y cuándo se sustituyó, si ya no es el vigente); un borrador, cuándo se generó.
  const { status, confirmedAt, replacedAt } = index.draft;
  const confirmedText =
    status === 'OFFICIAL' && confirmedAt !== null
      ? replacedAt === null
        ? t('schedule.export.document.confirmedAt', { date: format.format(new Date(confirmedAt)) })
        : t('schedule.export.document.confirmedAndReplacedAt', {
            date: format.format(new Date(confirmedAt)),
            replacedDate: format.format(new Date(replacedAt)),
          })
      : null;
  const generatedAt =
    confirmedText ??
    t('schedule.export.document.generatedAt', {
      date: format.format(new Date(index.draft.generatedAt)),
    });

  if (!all) {
    const [only] = sections;
    return {
      title: only?.heading ?? '',
      generatedAt,
      sections: only === undefined ? [] : [{ ...only, heading: null }],
    };
  }
  return {
    title: t(
      kind === 'class'
        ? 'schedule.export.document.allClassesTitle'
        : 'schedule.export.document.allProfessorsTitle',
    ),
    generatedAt,
    sections,
  };
}

/** Los cinco días, de lunes (1) a viernes (5). */
const DAYS = [1, 2, 3, 4, 5] as const;

/** «Viernes 15:00–15:45 · Matemáticas · 1º Primaria · A · García, Ana»: una sesión suelta, como se lista en pantalla. */
function entryLine(entry: ListedEntry, t: TFunction): string {
  const who =
    entry.professor === null
      ? t('schedule.draft.grid.noProfessor')
      : `${entry.professor.lastName}, ${entry.professor.firstName}`;
  const when = t('schedule.draft.entry', {
    day: t(`slots.grid.days.${String(entry.dayOfWeek)}`),
    start: entry.startTime,
    end: entry.endTime,
  });
  const where = t('schedule.draft.grid.classAt', {
    course: entry.courseName,
    class: entry.className,
  });
  return `${when} · ${entry.subject.name} · ${where} · ${who}`;
}

/** Lo que acompaña a la asignatura en una celda: el profesor o la clase, según la tabla. */
function detailOf(cell: DraftCell, detail: ExportPart['detail'], t: TFunction): string {
  if (detail === 'class') {
    return t('schedule.draft.grid.classAt', { course: cell.courseName, class: cell.className });
  }
  return cell.professor === null
    ? t('schedule.draft.grid.noProfessor')
    : `${cell.professor.lastName}, ${cell.professor.firstName}`;
}

/** Una fila de la tabla Markdown: las celdas separadas por barras, con un espacio a cada lado. */
const markdownRow = (cells: string[]) => `| ${cells.join(' | ')} |`;

function markdownTable(part: ExportPart, t: TFunction): string[] {
  const { table, detail } = part;
  const lines = [
    markdownRow([
      escapeMarkdown(t('schedule.draft.grid.sessionColumn')),
      ...DAYS.map((day) => escapeMarkdown(t(`slots.grid.days.${String(day)}`))),
    ]),
    markdownRow(['---', ...DAYS.map(() => '---')]),
  ];
  for (const row of table.rows) {
    if (row.kind === 'BREAK') {
      const label = t('schedule.draft.grid.breakRow', { start: row.startTime, end: row.endTime });
      lines.push(markdownRow([escapeMarkdown(label), ...DAYS.map(() => '')]));
      continue;
    }
    const session = t('schedule.draft.grid.session', { number: row.sessionNumber });
    const cells = DAYS.map((day) => {
      const cell = table.cells.get(`${String(day)}:${String(row.sessionNumber)}`);
      if (cell === undefined) {
        return escapeMarkdown(t('schedule.draft.grid.free'));
      }
      const code = cell.subject.code === null ? '' : ` (${escapeMarkdown(cell.subject.code)})`;
      return `${escapeMarkdown(cell.subject.name)}${code} — ${escapeMarkdown(detailOf(cell, detail, t))}`;
    });
    lines.push(
      markdownRow([`${escapeMarkdown(session)} (${row.startTime}–${row.endTime})`, ...cells]),
    );
  }
  return lines;
}

/** Un título en negrita, una frase de explicación y una lista de sesiones sueltas. */
function markdownList(title: string, intro: string, entries: ListedEntry[], t: TFunction) {
  return [
    `**${escapeMarkdown(title)}**`,
    '',
    escapeMarkdown(intro),
    '',
    ...entries.map((entry) => `- ${escapeMarkdown(entryLine(entry, t))}`),
  ];
}

/** El documento Markdown: tablas GFM con los nombres escapados. Sin color. */
export function toMarkdown(model: ExportModel, t: TFunction): string {
  const lines = [`# ${escapeMarkdown(model.title)}`, '', escapeMarkdown(model.generatedAt), ''];
  const several = model.sections.length > 1;
  for (const section of model.sections) {
    if (section.heading !== null) {
      lines.push(`## ${escapeMarkdown(section.heading)}`, '');
    }
    lines.push(escapeMarkdown(section.sessionsPerWeek), '');
    for (const part of section.parts) {
      if (part.heading !== null && section.parts.length > 1) {
        lines.push(`${several ? '###' : '##'} ${escapeMarkdown(part.heading)}`, '');
      }
      lines.push(...markdownTable(part, t), '');
      if (part.table.outside.length > 0) {
        lines.push(
          ...markdownList(
            t('schedule.draft.outside.title'),
            t('schedule.draft.outside.intro'),
            part.table.outside,
            t,
          ),
          '',
        );
      }
    }
    if (section.unlisted !== null) {
      const { title, intro, entries } = section.unlisted;
      lines.push(...markdownList(title, intro, entries, t), '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Los estilos del documento HTML: la tabla, el color exacto al imprimir, A4 horizontal y un horario por página. */
const HTML_STYLES = `
body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #212529; margin: 1.5rem; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
h2 { font-size: 1.25rem; margin: 0 0 0.25rem; }
h3 { font-size: 1.1rem; margin: 1rem 0 0.25rem; }
h4 { font-size: 1rem; margin: 0.5rem 0 0.25rem; }
p { margin: 0 0 0.5rem; }
table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1rem; }
caption { text-align: left; font-weight: 600; padding: 0.25rem 0; }
th, td { border: 1px solid #adb5bd; padding: 0.35rem 0.5rem; text-align: left; vertical-align: top; font-size: 0.9rem; }
thead th { background-color: #e9ecef; }
tr.break th, tr.break td { background-color: #f1f3f5; color: #495057; }
th .hours { display: block; font-weight: normal; color: #495057; }
td.free { color: #6c757d; text-align: center; }
td .detail { display: block; font-size: 0.85em; }
tr { break-inside: avoid; }
section + section { break-before: page; }
@page { size: A4 landscape; margin: 12mm; }
`;

/** El HTML de la lista de sesiones sueltas, con su título y su explicación. */
function htmlList(title: string, intro: string, entries: ListedEntry[], t: TFunction): string {
  const items = entries.map((entry) => `<li>${escapeHtml(entryLine(entry, t))}</li>`).join('');
  return `<div class="listed"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(intro)}</p><ul>${items}</ul></div>`;
}

function htmlTable(part: ExportPart, t: TFunction): string {
  const { table, detail } = part;
  const head = [
    `<th scope="col">${escapeHtml(t('schedule.draft.grid.sessionColumn'))}</th>`,
    ...DAYS.map((day) => `<th scope="col">${escapeHtml(t(`slots.grid.days.${String(day)}`))}</th>`),
  ].join('');
  const body = table.rows.map((row) => {
    if (row.kind === 'BREAK') {
      const label = t('schedule.draft.grid.breakRow', { start: row.startTime, end: row.endTime });
      const empty = DAYS.map(() => '<td></td>').join('');
      return `<tr class="break"><th scope="row">${escapeHtml(label)}</th>${empty}</tr>`;
    }
    const session = t('schedule.draft.grid.session', { number: row.sessionNumber });
    const hours = `${row.startTime}–${row.endTime}`;
    const cells = DAYS.map((day) => {
      const cell = table.cells.get(`${String(day)}:${String(row.sessionNumber)}`);
      if (cell === undefined) {
        return `<td class="free">${escapeHtml(t('schedule.draft.grid.free'))}</td>`;
      }
      const { background, text } = SUBJECT_COLOR_STYLES[cell.subject.color];
      const code = cell.subject.code === null ? '' : ` (${escapeHtml(cell.subject.code)})`;
      const style = escapeHtml(`background-color: ${background}; color: ${text}`);
      return `<td style="${style}"><strong>${escapeHtml(cell.subject.name)}</strong>${code}<span class="detail">${escapeHtml(detailOf(cell, detail, t))}</span></td>`;
    }).join('');
    return `<tr><th scope="row">${escapeHtml(session)}<span class="hours">${escapeHtml(hours)}</span></th>${cells}</tr>`;
  });
  return `<table><caption>${escapeHtml(part.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body.join('')}</tbody></table>`;
}

/**
 * El documento HTML: autónomo (un único `<style>`, sin scripts ni recursos externos), con el color de cada asignatura,
 * y que al imprimirse da una página A4 horizontal por horario. Se construye como texto, con todo escapado.
 */
export function toHtml(model: ExportModel, t: TFunction, locale: string): string {
  const several = model.sections.length > 1;
  const sections = model.sections.map((section) => {
    const out = [
      section.heading === null ? '' : `<h2>${escapeHtml(section.heading)}</h2>`,
      `<p>${escapeHtml(section.sessionsPerWeek)}</p>`,
    ];
    for (const part of section.parts) {
      if (part.heading !== null && section.parts.length > 1) {
        const level = several ? 'h3' : 'h2';
        out.push(`<${level}>${escapeHtml(part.heading)}</${level}>`);
      }
      out.push(htmlTable(part, t));
      if (part.table.outside.length > 0) {
        out.push(
          htmlList(
            t('schedule.draft.outside.title'),
            t('schedule.draft.outside.intro'),
            part.table.outside,
            t,
          ),
        );
      }
    }
    if (section.unlisted !== null) {
      const { title, intro, entries } = section.unlisted;
      out.push(htmlList(title, intro, entries, t));
    }
    return `<section>${out.join('\n')}</section>`;
  });
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.title)}</title>
<style>${HTML_STYLES}</style>
</head>
<body>
<h1>${escapeHtml(model.title)}</h1>
<p>${escapeHtml(model.generatedAt)}</p>
${sections.join('\n')}
</body>
</html>
`;
}

/** Un documento listo para descargar. */
export interface ExportedFile {
  fileName: string;
  mimeType: string;
  content: string;
}

interface ExportRequestWithFormat extends ExportRequest {
  format: ExportFormat;
}

/** El nombre con el que se identifica la clase o el profesor en el nombre del fichero. */
function targetName({ index, kind, target }: ExportRequest): string {
  if (kind === 'class') {
    const found = index.classes.get(target);
    return found === undefined ? '' : `${found.course.name} ${found.name}`;
  }
  const professor = index.professors.get(target);
  return professor === undefined ? '' : `${professor.lastName}, ${professor.firstName}`;
}

/**
 * El documento a descargar: el contenido en el formato elegido, su tipo y su nombre de fichero (el de «todos» lleva la
 * fecha local de generación del borrador). Lanza un error si la clase o el profesor no están en el borrador.
 */
export function exportSchedule(request: ExportRequestWithFormat): ExportedFile {
  const { format, kind, target, t, locale } = request;
  const model = buildExportModel(request);
  const all = target === 'all';
  const prefixKey = all
    ? kind === 'class'
      ? 'schedule.export.fileName.allClasses'
      : 'schedule.export.fileName.allProfessors'
    : 'schedule.export.fileName.one';
  const extension = format === 'markdown' ? 'md' : 'html';
  return {
    fileName: fileNameOf({
      prefix: t(prefixKey),
      name: all ? null : targetName(request),
      date: dateStampOf(request.index.draft.generatedAt),
      extension,
    }),
    mimeType: format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/html;charset=utf-8',
    content: format === 'markdown' ? toMarkdown(model, t) : toHtml(model, t, locale),
  };
}
