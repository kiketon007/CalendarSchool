import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import type { ReadinessIssue } from '../services/scheduleReadinessService';
import { ReadinessIssueItem } from './ReadinessIssueItem';

const texts = es.schedule.readiness;

const ref = (name: string, id: string) => ({ id, name });
const course = ref('1º Primaria', 'course-1');
const eva = { id: 'p-eva', firstName: 'Eva', lastName: 'García' };
const pedro = { id: 'p-pedro', firstName: 'Pedro', lastName: 'Soto' };

const workloadOfFirst: [string, string] = [
  'Carga horaria de 1º Primaria',
  '/cursos/course-1/carga',
];
const summary: [string, string] = ['Resumen de carga', '/profesores/resumen'];
const availabilityOfEva: [string, string] = [
  'Disponibilidad de García, Eva',
  '/profesores/p-eva/disponibilidad',
];

type Row = [string, ReadinessIssue, string, [string, string][]];

/** Cada código con lo que dice y a dónde enlaza. */
const rows: Row[] = [
  [
    'SCHOOL_WITHOUT_COURSES',
    { code: 'SCHOOL_WITHOUT_COURSES' },
    'El colegio aún no tiene cursos.',
    [['Crear curso', '/cursos/nuevo']],
  ],
  [
    'COURSE_WITHOUT_CALENDAR',
    { code: 'COURSE_WITHOUT_CALENDAR', course: ref('6º Primaria', 'course-6') },
    '6º Primaria tiene asignaturas y no tiene calendario.',
    [['Calendarios', '/calendarios']],
  ],
  [
    'WORKLOAD_EXCEEDS_SLOTS',
    { code: 'WORKLOAD_EXCEEDS_SLOTS', course, assigned: 31, available: 30 },
    '1º Primaria: la carga de 31 sesiones supera las 30 de su calendario.',
    [workloadOfFirst],
  ],
  [
    'BLOCK_LARGER_THAN_LOAD',
    { code: 'BLOCK_LARGER_THAN_LOAD', course, subject: ref('Plástica', 'subject-art') },
    'Plástica en 1º Primaria: pide bloques mayores que sus sesiones a la semana.',
    [workloadOfFirst],
  ],
  [
    'SUBJECT_DOES_NOT_FIT',
    { code: 'SUBJECT_DOES_NOT_FIT', course, subject: ref('Música', 'subject-music') },
    'Música en 1º Primaria no cabe en la semana con sus reglas.',
    [workloadOfFirst],
  ],
  [
    'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR',
    {
      code: 'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR',
      course,
      subject: ref('Inglés', 'subject-english'),
      schoolClass: ref('A', 'class-a'),
      professor: eva,
    },
    'Inglés en 1º Primaria A no cabe con García, Eva: sus franjas prohibidas y las horas en que no puede no dejan sitio.',
    [availabilityOfEva, workloadOfFirst],
  ],
  [
    'CLASSES_WITHOUT_PROFESSOR (two classes)',
    {
      code: 'CLASSES_WITHOUT_PROFESSOR',
      course,
      subject: ref('Lengua', 'subject-language'),
      classes: [ref('B', 'class-b'), ref('C', 'class-c')],
      missingCount: 2,
    },
    '1º Primaria: Lengua no tiene profesor en las clases B y C.',
    [['Profesores de 1º Primaria', '/cursos/course-1/profesores']],
  ],
  [
    'CLASSES_WITHOUT_PROFESSOR (one class)',
    {
      code: 'CLASSES_WITHOUT_PROFESSOR',
      course,
      subject: ref('Lengua', 'subject-language'),
      classes: [ref('B', 'class-b')],
      missingCount: 1,
    },
    '1º Primaria: Lengua no tiene profesor en la clase B.',
    [['Profesores de 1º Primaria', '/cursos/course-1/profesores']],
  ],
  [
    'EXCEEDS_MAX_HOURS',
    { code: 'EXCEEDS_MAX_HOURS', professor: pedro },
    'Soto, Pedro pasa de 23 h aunque le toquen las sesiones más cortas.',
    [summary],
  ],
  [
    'AVAILABILITY_INSUFFICIENT',
    {
      code: 'AVAILABILITY_INSUFFICIENT',
      professor: eva,
      calendar: ref('Primaria', 'cal-1'),
      sessions: 22,
      available: 20,
    },
    'García, Eva tiene en «Primaria» 22 sesiones y solo puede dar 20.',
    [availabilityOfEva],
  ],
  [
    'SUBJECT_INACTIVE',
    {
      code: 'SUBJECT_INACTIVE',
      subject: ref('Francés', 'subject-french'),
      courses: [ref('2º Primaria', 'course-2'), ref('5º Primaria', 'course-5')],
    },
    'Francés está inactiva y no se generará (2º Primaria y 5º Primaria).',
    [['Editar Francés', '/asignaturas/subject-french/editar']],
  ],
  [
    'COURSE_WITHOUT_CLASSES',
    { code: 'COURSE_WITHOUT_CLASSES', course: ref('2 años', 'course-2y') },
    '2 años no tiene clases.',
    [['Editar 2 años', '/cursos/course-2y/editar']],
  ],
  [
    'COURSE_WITHOUT_SUBJECTS',
    { code: 'COURSE_WITHOUT_SUBJECTS', course: ref('3 años', 'course-3y') },
    '3 años no tiene asignaturas activas.',
    [['Carga horaria de 3 años', '/cursos/course-3y/carga']],
  ],
  [
    'WORKLOAD_BELOW_SLOTS',
    {
      code: 'WORKLOAD_BELOW_SLOTS',
      course: ref('1º Primaria', 'course-1'),
      assigned: 25,
      available: 30,
    },
    '1º Primaria tiene 25 sesiones para 30 franjas: quedarán 5 huecos libres en cada clase.',
    [['Carga horaria de 1º Primaria', '/cursos/course-1/carga']],
  ],
  [
    'WORKLOAD_BELOW_SLOTS (one free slot)',
    {
      code: 'WORKLOAD_BELOW_SLOTS',
      course: ref('1º Primaria', 'course-1'),
      assigned: 29,
      available: 30,
    },
    '1º Primaria tiene 29 sesiones para 30 franjas: quedará 1 hueco libre en cada clase.',
    [['Carga horaria de 1º Primaria', '/cursos/course-1/carga']],
  ],
  [
    'MAY_EXCEED_MAX_HOURS',
    { code: 'MAY_EXCEED_MAX_HOURS', professor: pedro },
    'Soto, Pedro puede pasar de 23 h según las sesiones que le toquen.',
    [summary],
  ],
  [
    'SEVERAL_CALENDARS',
    { code: 'SEVERAL_CALENDARS', professor: pedro, count: 2 },
    'Soto, Pedro da clase en 2 calendarios: la generación comprueba que sus sesiones no se solapen.',
    [summary],
  ],
  [
    'SLOTS_OUTSIDE_CALENDAR (several)',
    {
      code: 'SLOTS_OUTSIDE_CALENDAR',
      course,
      subject: ref('Música', 'subject-music'),
      count: 2,
    },
    'Música en 1º Primaria: 2 franjas guardadas ya no existen en el calendario y se ignoran.',
    [['Franjas prohibidas de Música', '/cursos/course-1/carga/subject-music/prohibidas']],
  ],
  [
    'SLOTS_OUTSIDE_CALENDAR (one)',
    {
      code: 'SLOTS_OUTSIDE_CALENDAR',
      course,
      subject: ref('Música', 'subject-music'),
      count: 1,
    },
    'Música en 1º Primaria: 1 franja guardada ya no existe en el calendario y se ignora.',
    [['Franjas prohibidas de Música', '/cursos/course-1/carga/subject-music/prohibidas']],
  ],
  [
    'PREFERRED_SLOTS_FORBIDDEN (several)',
    {
      code: 'PREFERRED_SLOTS_FORBIDDEN',
      course,
      subject: ref('Música', 'subject-music'),
      count: 3,
    },
    'Música en 1º Primaria: 3 franjas preferidas también están prohibidas y se ignoran.',
    [['Franjas preferidas de Música', '/cursos/course-1/carga/subject-music/preferidas']],
  ],
  [
    'PREFERRED_SLOTS_FORBIDDEN (one)',
    {
      code: 'PREFERRED_SLOTS_FORBIDDEN',
      course,
      subject: ref('Música', 'subject-music'),
      count: 1,
    },
    'Música en 1º Primaria: 1 franja preferida también está prohibida y se ignora.',
    [['Franjas preferidas de Música', '/cursos/course-1/carga/subject-music/preferidas']],
  ],
];

function renderItem(issue: ReadinessIssue, kind: 'blocking' | 'warning' = 'blocking') {
  return render(
    <MemoryRouter>
      <ul>
        <ReadinessIssueItem issue={issue} kind={kind} />
      </ul>
    </MemoryRouter>,
  );
}

describe('ReadinessIssueItem', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  it.each(rows)('says %s and links to where it is fixed', (_name, issue, text, links) => {
    renderItem(issue);

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent(text);
    expect(
      within(item)
        .queryAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual(links);
  });

  it.each([
    ['blocking' as const, texts.kind.blocking],
    ['warning' as const, texts.kind.warning],
  ])('says in words that a %s problem is one', (kind, label) => {
    renderItem({ code: 'COURSE_WITHOUT_CLASSES', course: ref('2 años', 'course-2y') }, kind);

    expect(screen.getByRole('listitem')).toHaveTextContent(label);
  });

  it('covers the seventeen codes of the contract', () => {
    const codes = new Set(rows.map(([, issue]) => issue.code));

    expect(codes.size).toBe(17);
  });

  it('says it in English with its own plurals and links', async () => {
    await i18n.changeLanguage('en');
    renderItem({
      code: 'CLASSES_WITHOUT_PROFESSOR',
      course,
      subject: ref('Lengua', 'subject-language'),
      classes: [ref('B', 'class-b'), ref('C', 'class-c')],
      missingCount: 2,
    });

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('1º Primaria: Lengua has no professor in classes B and C.');
    expect(within(item).getByRole('link', { name: 'Professors of 1º Primaria' })).toHaveAttribute(
      'href',
      '/cursos/course-1/profesores',
    );
  });
});
