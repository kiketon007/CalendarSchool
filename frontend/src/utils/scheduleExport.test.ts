import { describe, expect, it } from 'vitest';
import i18n from '../i18n/i18n';
import { exportDraft, exportIndex, GENERATED_AT } from '../testSupport/exportDraft';
import { indexDraft } from './scheduleDraftViews';
import { SUBJECT_COLOR_STYLES } from './subjectColors';
import {
  buildExportModel,
  dateStampOf,
  escapeHtml,
  escapeMarkdown,
  exportSchedule,
  fileNameOf,
  toHtml,
  toMarkdown,
} from './scheduleExport';

describe('dateStampOf', () => {
  it('writes the local date of the generation as YYYY-MM-DD', () => {
    // Las 23:30 locales del 5 de noviembre: en UTC puede ser ya el día 6, pero el nombre usa la hora local.
    const generatedAt = new Date(2026, 10, 5, 23, 30).toISOString();

    expect(dateStampOf(generatedAt)).toBe('2026-11-05');
  });

  it('pads the month and the day', () => {
    expect(dateStampOf(new Date(2027, 0, 3, 8, 0).toISOString())).toBe('2027-01-03');
  });
});

describe('fileNameOf', () => {
  const date = '2026-11-05';

  it('names one class after its course and its name, without accents', () => {
    expect(fileNameOf({ prefix: 'horario', name: '1º Primaria A', date, extension: 'md' })).toBe(
      'horario-1o-primaria-a.md',
    );
  });

  it('names one professor after the last name and the first name', () => {
    expect(
      fileNameOf({ prefix: 'horario', name: 'García-López, José María', date, extension: 'html' }),
    ).toBe('horario-garcia-lopez-jose-maria.html');
  });

  it('writes the feminine ordinal as a', () => {
    expect(fileNameOf({ prefix: 'horario', name: '1ª Fase', date, extension: 'md' })).toBe(
      'horario-1a-fase.md',
    );
  });

  it('names all of them after the date of the generation', () => {
    expect(fileNameOf({ prefix: 'horarios-clases', name: null, date, extension: 'md' })).toBe(
      'horarios-clases-2026-11-05.md',
    );
    expect(fileNameOf({ prefix: 'horarios-profesores', name: null, date, extension: 'html' })).toBe(
      'horarios-profesores-2026-11-05.html',
    );
  });

  it('collapses the repeated separators and trims the ends', () => {
    expect(
      fileNameOf({ prefix: 'horario', name: '  --Ñandú /  \\ 2--  ', date, extension: 'md' }),
    ).toBe('horario-nandu-2.md');
  });

  it('falls back to the prefix and the date when the name has nothing to keep', () => {
    expect(fileNameOf({ prefix: 'horario', name: '¿?!', date, extension: 'md' })).toBe(
      'horario-2026-11-05.md',
    );
  });

  it('uses the prefix it is given, for example the English one', () => {
    expect(fileNameOf({ prefix: 'timetable', name: '2nd Primary B', date, extension: 'md' })).toBe(
      'timetable-2nd-primary-b.md',
    );
  });
});

describe('escapeMarkdown', () => {
  it('puts a backslash before every character that Markdown or the table would read', () => {
    expect(escapeMarkdown('a\\b|c*d_e`f[g]h<i>j')).toBe('a\\\\b\\|c\\*d\\_e\\`f\\[g\\]h\\<i\\>j');
  });

  it('turns every kind of line break into a space', () => {
    expect(escapeMarkdown('uno\r\ndos\ntres\rcuatro')).toBe('uno dos tres cuatro');
  });

  it('leaves the rest of the text as it is', () => {
    expect(escapeMarkdown('Matemáticas (MAT) · 1º Primaria')).toBe(
      'Matemáticas (MAT) · 1º Primaria',
    );
  });
});

describe('escapeHtml', () => {
  it('replaces the five characters that HTML reads', () => {
    expect(escapeHtml(`<b class="x">Tom & 'Jerry'</b>`)).toBe(
      '&lt;b class=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/b&gt;',
    );
  });

  it('does not escape twice what it just escaped', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('buildExportModel', () => {
  const t = i18n.getFixedT('es');
  const generated = `Borrador generado el ${new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(GENERATED_AT))}`;
  const build = (kind: 'class' | 'professor', target: string) =>
    buildExportModel({ index: exportIndex, kind, target, t, locale: 'es' });

  describe('one class', () => {
    it('is titled after the class and has one section without a heading of its own', () => {
      const model = build('class', 'class-1a');

      expect(model.title).toBe('Horario de 1º Primaria A');
      expect(model.generatedAt).toBe(generated);
      expect(model.sections).toHaveLength(1);
      expect(model.sections[0]?.heading).toBeNull();
      expect(model.sections[0]?.sessionsPerWeek).toBe('3 sesiones a la semana');
    });

    it('has one table, the one of the screen, without a calendar heading', () => {
      const [section] = build('class', 'class-1a').sections;

      expect(section?.parts).toHaveLength(1);
      const part = section?.parts[0];
      expect(part?.caption).toBe('Horario de 1º Primaria A');
      expect(part?.heading).toBeNull();
      expect([...(part?.table.cells.keys() ?? [])]).toEqual(['1:1', '2:2']);
      expect(part?.table.outside).toHaveLength(1);
      expect(section?.unlisted).toBeNull();
    });

    it('lists the sessions by day when the course has no calendar', () => {
      const [section] = build('class', 'class-7a').sections;

      expect(section?.parts).toEqual([]);
      expect(section?.unlisted?.title).toBe('Este curso ya no tiene calendario');
      expect(section?.unlisted?.intro).toContain('sus sesiones guardadas');
      expect(section?.unlisted?.entries.map(({ dayOfWeek }) => dayOfWeek)).toEqual([3, 4]);
    });
  });

  describe('all the classes', () => {
    it('has a general title, a section per class in the order of courses and classes and the date once', () => {
      const model = build('class', 'all');

      expect(model.title).toBe('Horarios de las clases');
      expect(model.generatedAt).toBe(generated);
      expect(model.sections.map(({ heading }) => heading)).toEqual([
        'Horario de 1º Primaria A',
        'Horario de 1º Primaria B',
        'Horario de 5º Primaria A',
        'Horario de 7º A',
      ]);
    });

    it('gives each section its own table, count and unlisted sessions', () => {
      const { sections } = build('class', 'all');

      expect(sections.map(({ parts }) => parts.length)).toEqual([1, 1, 1, 0]);
      expect(sections.map(({ sessionsPerWeek }) => sessionsPerWeek)).toEqual([
        '3 sesiones a la semana',
        '1 sesión a la semana',
        '1 sesión a la semana',
        '2 sesiones a la semana',
      ]);
      expect(sections[3]?.unlisted?.entries).toHaveLength(2);
    });
  });

  describe('one professor', () => {
    it('is titled after last name and first name', () => {
      const model = build('professor', 'luis');

      expect(model.title).toBe('Horario de Pérez, Luis');
      expect(model.sections).toHaveLength(1);
      expect(model.sections[0]?.heading).toBeNull();
      expect(model.sections[0]?.sessionsPerWeek).toBe('1 sesión a la semana');
    });

    it('has one table per calendar, named after it, in the order of the first session', () => {
      const [section] = build('professor', 'ana').sections;

      expect(section?.sessionsPerWeek).toBe('4 sesiones a la semana');
      expect(section?.parts.map(({ caption }) => caption)).toEqual([
        'Horario de García, Ana · calendario «Primaria»',
        'Horario de García, Ana · calendario «Tercer ciclo»',
      ]);
      expect(section?.parts.map(({ heading }) => heading)).toEqual([
        'Calendario «Primaria»',
        'Calendario «Tercer ciclo»',
      ]);
      expect(section?.parts.map(({ table }) => table.cells.size)).toEqual([2, 1]);
    });

    it('lists apart the sessions in courses without a calendar', () => {
      const [section] = build('professor', 'ana').sections;

      expect(section?.unlisted?.title).toBe('Sesiones en cursos sin calendario');
      expect(section?.unlisted?.entries.map(({ className }) => className)).toEqual(['A']);
    });

    it('has no unlisted sessions when every course has a calendar', () => {
      expect(build('professor', 'luis').sections[0]?.unlisted).toBeNull();
    });
  });

  describe('all the professors', () => {
    it('has a general title and a section per professor in the order of the draft', () => {
      const model = build('professor', 'all');

      expect(model.title).toBe('Horarios de los profesores');
      expect(model.generatedAt).toBe(generated);
      expect(model.sections.map(({ heading }) => heading)).toEqual([
        'Horario de García, Ana',
        'Horario de Pérez, Luis',
      ]);
    });

    it('leaves the sessions without a professor out of every section', () => {
      const { sections } = build('professor', 'all');

      const cells = sections.flatMap(({ parts }) => parts.map(({ table }) => table.cells.size));
      expect(cells.reduce((sum, size) => sum + size, 0)).toBe(4);
    });
  });

  it('writes the texts in the language it is given', () => {
    const model = buildExportModel({
      index: exportIndex,
      kind: 'professor',
      target: 'all',
      t: i18n.getFixedT('en'),
      locale: 'en',
    });

    expect(model.title).toBe('Professor timetables');
    expect(model.generatedAt).toMatch(/^Draft generated on /u);
  });

  it('refuses a class or a professor that is not in the draft', () => {
    expect(() => build('class', 'nope')).toThrow();
    expect(() => build('professor', 'nope')).toThrow();
  });
});

describe('toMarkdown', () => {
  const t = i18n.getFixedT('es');
  const markdownOf = (kind: 'class' | 'professor', target: string, index = exportIndex) =>
    toMarkdown(buildExportModel({ index, kind, target, t, locale: 'es' }), t);

  describe('one class', () => {
    const markdown = markdownOf('class', 'class-1a');

    it('starts with the title, the date of the generation and the sessions per week', () => {
      const lines = markdown.split('\n');

      expect(lines[0]).toBe('# Horario de 1º Primaria A');
      expect(lines[2]).toMatch(/^Borrador generado el /u);
      expect(lines).toContain('3 sesiones a la semana');
    });

    it('writes the header with the five days and its separator', () => {
      expect(markdown).toContain(
        '| Sesión | Lunes | Martes | Miércoles | Jueves | Viernes |\n| --- | --- | --- | --- | --- | --- |\n',
      );
    });

    it('writes a row per session and one for the break, with the cells in their day', () => {
      expect(markdown).toContain(
        '| Sesión 1 (09:00–09:45) | Inglés (ING) — García, Ana | Libre | Libre | Libre | Libre |',
      );
      expect(markdown).toContain(
        '| Sesión 2 (09:45–10:30) | Libre | Inglés (ING) — García, Ana | Libre | Libre | Libre |',
      );
      expect(markdown).toContain('| Recreo 10:30–11:00 |  |  |  |  |  |');
      expect(markdown).toContain(
        '| Sesión 3 (11:00–11:45) | Libre | Libre | Libre | Libre | Libre |',
      );
    });

    it('has no heading of its own for a table, and lists the sessions outside the calendar', () => {
      expect(markdown).not.toContain('## ');
      expect(markdown).toContain('**Sesiones fuera del calendario actual**');
      expect(markdown).toContain(
        '- Viernes 15:00–15:45 · Matemáticas · 1º Primaria · A · Sin profesor',
      );
    });
  });

  it('lists by day the sessions of a course without a calendar, with no table', () => {
    const markdown = markdownOf('class', 'class-7a');

    expect(markdown).toContain('**Este curso ya no tiene calendario**');
    expect(markdown).toContain('- Miércoles 12:00–12:45 · Matemáticas · 7º · A · Sin profesor');
    expect(markdown).toContain('- Jueves 09:00–09:45 · Inglés · 7º · A · García, Ana');
    expect(markdown).not.toContain('| Sesión |');
  });

  it('puts a heading per calendar, at level 2, in the timetable of one professor with two', () => {
    const markdown = markdownOf('professor', 'ana');

    expect(markdown).toContain('# Horario de García, Ana');
    expect(markdown).toContain('\n## Calendario «Primaria»\n');
    expect(markdown).toContain('\n## Calendario «Tercer ciclo»\n');
    expect(markdown).toContain(
      '| Sesión 1 (09:00–09:45) | Inglés (ING) — 1º Primaria · A | Libre | Libre | Libre | Libre |',
    );
    expect(markdown).toContain('**Sesiones en cursos sin calendario**');
  });

  it('has no calendar heading for a professor with a single calendar', () => {
    expect(markdownOf('professor', 'luis')).not.toContain('Calendario «');
  });

  it('puts a section per timetable under the general title, with calendars one level below', () => {
    const classes = markdownOf('class', 'all');
    const professors = markdownOf('professor', 'all');

    expect(classes.split('\n')[0]).toBe('# Horarios de las clases');
    expect(classes).toContain('\n## Horario de 1º Primaria B\n');
    expect(classes).toContain('\n## Horario de 7º A\n');
    expect(professors.split('\n')[0]).toBe('# Horarios de los profesores');
    expect(professors).toContain('\n## Horario de García, Ana\n');
    expect(professors).toContain('\n### Calendario «Tercer ciclo»\n');
  });

  describe('with a name that looks like Markdown', () => {
    const tricky = indexDraft({
      ...exportDraft,
      subjects: [
        { id: 'english', name: 'Lengua | <b>Taller</b>', code: 'L|1', color: 'blue' },
        { id: 'maths', name: 'Matemáticas', code: null, color: 'red' },
      ],
    });
    const markdown = markdownOf('class', 'class-1a', tricky);

    it('escapes it, so that the row keeps its six cells', () => {
      const row = markdown.split('\n').find((line) => line.includes('Lengua'));

      expect(row).toBe(
        '| Sesión 1 (09:00–09:45) | Lengua \\| \\<b\\>Taller\\</b\\> (L\\|1) — García, Ana | Libre | Libre | Libre | Libre |',
      );
      expect(row?.match(/(?<!\\)\|/gu)).toHaveLength(7);
    });
  });
});

describe('toHtml', () => {
  const t = i18n.getFixedT('es');
  const htmlOf = (kind: 'class' | 'professor', target: string, index = exportIndex) =>
    toHtml(buildExportModel({ index, kind, target, t, locale: 'es' }), t, 'es');
  const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

  describe('the document', () => {
    const html = htmlOf('class', 'class-1a');
    const doc = parse(html);

    it('is a complete document in the language of the interface, with a title', () => {
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(doc.documentElement.lang).toBe('es');
      expect(doc.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
      expect(doc.title).toBe('Horario de 1º Primaria A');
      expect(doc.querySelector('h1')?.textContent).toBe('Horario de 1º Primaria A');
    });

    it('has a single style element that prints on A4 landscape, one timetable per page and with colors', () => {
      const styles = doc.querySelectorAll('style');

      expect(styles).toHaveLength(1);
      const css = styles[0]?.textContent ?? '';
      expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4 landscape/u);
      expect(css).toMatch(/section \+ section\s*\{[^}]*break-before:\s*page/u);
      expect(css).toContain('print-color-adjust: exact');
    });

    it('has a captioned table with the days as column headers and each session as a row header', () => {
      const table = doc.querySelector('table');

      expect(table?.querySelector('caption')?.textContent).toBe('Horario de 1º Primaria A');
      const columns = [...(table?.querySelectorAll('thead th') ?? [])];
      expect(columns.map((th) => th.getAttribute('scope'))).toEqual(Array<string>(6).fill('col'));
      expect(columns.map((th) => th.textContent)).toEqual([
        'Sesión',
        'Lunes',
        'Martes',
        'Miércoles',
        'Jueves',
        'Viernes',
      ]);
      const rows = [...(table?.querySelectorAll('tbody th') ?? [])];
      expect(rows.map((th) => th.getAttribute('scope'))).toEqual(Array<string>(4).fill('row'));
      expect(rows.map((th) => th.textContent)).toEqual([
        'Sesión 109:00–09:45',
        'Sesión 209:45–10:30',
        'Recreo 10:30–11:00',
        'Sesión 311:00–11:45',
      ]);
    });

    it('paints each cell with the background and the text of the color of its subject', () => {
      const { background, text } = SUBJECT_COLOR_STYLES.blue;

      expect(html).toContain(`background-color: ${background}; color: ${text}`);
      const filled = [...doc.querySelectorAll('td')].filter((td) =>
        td.textContent.includes('Inglés'),
      );
      expect(filled).toHaveLength(2);
      expect(filled[0]?.textContent).toContain('García, Ana');
      expect(filled[0]?.textContent).toContain('(ING)');
    });

    it('writes Free in the empty cells and leaves the cells of the break empty', () => {
      expect(doc.querySelectorAll('td.free')).toHaveLength(13);
      const breakRow = [...doc.querySelectorAll('tbody tr')].find((tr) =>
        tr.textContent.includes('Recreo'),
      );
      expect([...(breakRow?.querySelectorAll('td') ?? [])].map((td) => td.textContent)).toEqual(
        Array<string>(5).fill(''),
      );
    });

    it('lists the sessions outside the calendar below the table', () => {
      expect(doc.body.textContent).toContain('Sesiones fuera del calendario actual');
      expect(doc.body.textContent).toContain(
        'Viernes 15:00–15:45 · Matemáticas · 1º Primaria · A · Sin profesor',
      );
    });
  });

  it('has a section per professor, and a table per calendar in the one with two', () => {
    const doc = parse(htmlOf('professor', 'all'));

    expect(doc.querySelector('h1')?.textContent).toBe('Horarios de los profesores');
    expect(doc.querySelectorAll('section')).toHaveLength(2);
    const captions = [...doc.querySelectorAll('section:first-of-type table caption')];
    expect(captions.map((caption) => caption.textContent)).toEqual([
      'Horario de García, Ana · calendario «Primaria»',
      'Horario de García, Ana · calendario «Tercer ciclo»',
    ]);
    expect(doc.body.textContent).toContain('Sesiones en cursos sin calendario');
  });

  it('lists by day the sessions of a course without a calendar, with no table', () => {
    const doc = parse(htmlOf('class', 'class-7a'));

    expect(doc.querySelector('table')).toBeNull();
    expect(doc.body.textContent).toContain('Este curso ya no tiene calendario');
    expect(doc.body.textContent).toContain('Miércoles 12:00–12:45 · Matemáticas · 7º · A');
  });

  describe('with names that look like markup', () => {
    const tricky = indexDraft({
      ...exportDraft,
      subjects: [
        { id: 'english', name: 'Lengua | <b>Taller</b>', code: '<i>x</i>', color: 'blue' },
        { id: 'maths', name: 'Matemáticas', code: null, color: 'red' },
      ],
      professors: [
        { id: 'ana', firstName: 'Ana "la" <u>', lastName: "O'Brien & Co" },
        { id: 'luis', firstName: 'Luis', lastName: 'Pérez' },
      ],
    });

    it('writes them as text, never as elements', () => {
      const html = htmlOf('class', 'all', tricky);
      const doc = parse(html);

      expect(html).toContain('Lengua | &lt;b&gt;Taller&lt;/b&gt;');
      expect(doc.querySelector('b, i, u')).toBeNull();
      expect(doc.body.textContent).toContain('Lengua | <b>Taller</b> (<i>x</i>)');
      expect(doc.body.textContent).toContain('O\'Brien & Co, Ana "la" <u>');
    });
  });

  it('has nothing to run and nothing to download', () => {
    for (const [kind, target] of [
      ['class', 'all'],
      ['professor', 'all'],
    ] as const) {
      expect(htmlOf(kind, target)).not.toMatch(/<script|<link|<img|<iframe|@import|url\(/iu);
    }
  });
});

describe('exportSchedule', () => {
  const es = i18n.getFixedT('es');
  const en = i18n.getFixedT('en');
  const run = (
    format: 'markdown' | 'html',
    kind: 'class' | 'professor',
    target: string,
    language: 'es' | 'en' = 'es',
  ) =>
    exportSchedule({
      index: exportIndex,
      format,
      kind,
      target,
      t: language === 'es' ? es : en,
      locale: language,
    });

  it('exports one class as Markdown', () => {
    const result = run('markdown', 'class', 'class-1a');

    expect(result.fileName).toBe('horario-1o-primaria-a.md');
    expect(result.mimeType).toBe('text/markdown;charset=utf-8');
    expect(result.content.startsWith('# Horario de 1º Primaria A\n')).toBe(true);
  });

  it('exports one professor as HTML', () => {
    const result = run('html', 'professor', 'ana');

    expect(result.fileName).toBe('horario-garcia-ana.html');
    expect(result.mimeType).toBe('text/html;charset=utf-8');
    expect(result.content.startsWith('<!doctype html>')).toBe(true);
    expect(result.content).toContain('<title>Horario de García, Ana</title>');
  });

  it('names the files of all of them after the local date of the generation', () => {
    expect(run('html', 'class', 'all').fileName).toBe('horarios-clases-2026-11-04.html');
    expect(run('markdown', 'professor', 'all').fileName).toBe('horarios-profesores-2026-11-04.md');
  });

  it('writes the texts, the prefixes and the language of the document in English', () => {
    const markdown = run('markdown', 'class', 'class-1a', 'en');
    const html = run('html', 'class', 'all', 'en');

    expect(markdown.fileName).toBe('timetable-1o-primaria-a.md');
    expect(markdown.content).toContain('# Timetable of 1º Primaria A');
    expect(markdown.content).toContain('| Session | Monday | Tuesday |');
    expect(html.fileName).toBe('timetables-classes-2026-11-04.html');
    expect(html.content).toContain('<html lang="en">');
    expect(run('markdown', 'professor', 'all', 'en').fileName).toBe(
      'timetables-professors-2026-11-04.md',
    );
  });

  it('refuses a class or a professor that is not in the draft', () => {
    expect(() => run('markdown', 'class', 'nope')).toThrow();
    expect(() => run('html', 'professor', 'nope')).toThrow();
  });
});

describe('the export of an official schedule (US-ALGO-CONFIRM)', () => {
  const t = i18n.getFixedT('es');
  const CONFIRMED_AT = new Date(2026, 10, 5, 9, 10).toISOString();
  const officialIndex = indexDraft({
    ...exportDraft,
    status: 'OFFICIAL',
    confirmedAt: CONFIRMED_AT,
    confirmedBy: { firstName: 'Ana', lastName: 'García' },
  });
  const confirmedOn = `Horario oficial confirmado el ${new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(CONFIRMED_AT))}`;
  const exportOfficial = (
    format: 'markdown' | 'html',
    kind: 'class' | 'professor',
    target: string,
  ) => exportSchedule({ index: officialIndex, format, kind, target, t, locale: 'es' });

  it('says when it was confirmed in the model, not when it was generated', () => {
    const model = buildExportModel({
      index: officialIndex,
      kind: 'class',
      target: 'class-1a',
      t,
      locale: 'es',
    });

    expect(model.generatedAt).toBe(confirmedOn);
  });

  it('writes it in the Markdown and in the HTML, once, for one timetable and for all', () => {
    for (const [kind, target] of [
      ['class', 'class-1a'],
      ['class', 'all'],
      ['professor', 'ana'],
      ['professor', 'all'],
    ] as const) {
      for (const format of ['markdown', 'html'] as const) {
        const { content } = exportOfficial(format, kind, target);

        expect(content).toContain(confirmedOn);
        expect(content).not.toContain('Borrador generado el');
        expect(content.split(confirmedOn)).toHaveLength(2);
      }
    }
  });

  it('keeps the name of the files, with the date of the generation', () => {
    expect(exportOfficial('markdown', 'class', 'class-1a').fileName).toBe(
      'horario-1o-primaria-a.md',
    );
    expect(exportOfficial('html', 'class', 'all').fileName).toBe('horarios-clases-2026-11-04.html');
  });

  it('writes it in English in the language of the interface', () => {
    const { content } = exportSchedule({
      index: officialIndex,
      format: 'markdown',
      kind: 'class',
      target: 'class-1a',
      t: i18n.getFixedT('en'),
      locale: 'en',
    });

    expect(content).toContain('Official timetable confirmed on');
  });

  it('still says generated for a draft', () => {
    expect(
      exportSchedule({
        index: exportIndex,
        format: 'markdown',
        kind: 'class',
        target: 'class-1a',
        t,
        locale: 'es',
      }).content,
    ).toContain('Borrador generado el');
  });
});
