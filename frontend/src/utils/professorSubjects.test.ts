import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n/i18n';
import type { Professor } from '../services/professorsService';
import { subjectsTextOf } from './professorSubjects';

type ProfessorSubject = Professor['subjects'][number];

const subject = (subjectName: string, courseName: string, className: string): ProfessorSubject => ({
  subjectId: `${subjectName}-${courseName}-${className}`,
  subjectName,
  courseId: courseName,
  courseName,
  classId: `${courseName}-${className}`,
  className,
  sessionsPerWeek: 3,
});

describe('subjectsTextOf', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('says there are no subjects when the professor has none', () => {
    expect(subjectsTextOf([], i18n.t)).toBe('Sin asignaturas');
  });

  it('groups the classes by subject in the order it receives them', () => {
    const text = subjectsTextOf(
      [
        subject('Inglés', '1º Primaria', 'A'),
        subject('Inglés', '1º Primaria', 'B'),
        subject('Lengua', '2º Primaria', 'A'),
      ],
      i18n.t,
    );

    expect(text).toBe('Inglés: 1º Primaria A, 1º Primaria B · Lengua: 2º Primaria A');
  });

  it('keeps one group when the same subject is separated by another in the list', () => {
    const text = subjectsTextOf(
      [
        subject('Inglés', '1º Primaria', 'A'),
        subject('Lengua', '1º Primaria', 'A'),
        subject('Inglés', '2º Primaria', 'A'),
      ],
      i18n.t,
    );

    expect(text).toBe('Inglés: 1º Primaria A, 2º Primaria A · Lengua: 1º Primaria A');
  });

  it('uses the texts of the active language', async () => {
    await i18n.changeLanguage('en');

    expect(subjectsTextOf([], i18n.t)).toBe('No subjects');
  });
});
