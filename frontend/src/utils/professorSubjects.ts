import type { TFunction } from 'i18next';
import type { Professor } from '../services/professorsService';

/**
 * Las asignaturas de un profesor agrupadas por nombre, en el orden del servicio: «Inglés: 1º Primaria A, 1º Primaria
 * B · Lengua: 2º Primaria A». Sin ninguna, el texto de «Sin asignaturas». Lo usan la columna «Asignaturas» del
 * listado y el diálogo de borrado (US-PROF-ASSIGN_b).
 */
export function subjectsTextOf(subjects: Professor['subjects'], t: TFunction): string {
  if (subjects.length === 0) return t('professors.noSubjects');
  const bySubject = new Map<string, string[]>();
  for (const { subjectName, courseName, className } of subjects) {
    const classes = bySubject.get(subjectName) ?? [];
    classes.push(`${courseName} ${className}`);
    bySubject.set(subjectName, classes);
  }
  return [...bySubject]
    .map(([subject, classes]) =>
      t('professors.subjectsOf', { subject, classes: classes.join(', ') }),
    )
    .join(' · ');
}
