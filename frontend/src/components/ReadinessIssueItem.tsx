import Badge from 'react-bootstrap/Badge';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ReadinessIssue } from '../services/scheduleReadinessService';

interface ReadinessIssueItemProps {
  issue: ReadinessIssue;
  /** Si impide generar o solo es un aviso: se dice con palabras, el color nunca es la única pista. */
  kind: 'blocking' | 'warning';
}

/** Un profesor como «Apellidos, Nombre», igual que en el resto de pantallas. */
const professorName = (professor: ReadinessIssue['professor']): string =>
  professor === undefined ? '' : `${professor.lastName}, ${professor.firstName}`;

/**
 * Un problema de la comprobación previa a generar los horarios (US-ALGO-CHECK): qué pasa, escrito a partir de su código
 * y de lo que cita, y un enlace a donde se corrige. Es un elemento de lista (`li`).
 */
export function ReadinessIssueItem({ issue, kind }: ReadinessIssueItemProps) {
  const { t, i18n } = useTranslation();
  const list = new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' });
  const names = (refs: ReadinessIssue['classes']) =>
    list.format((refs ?? []).map(({ name }) => name));

  const course = issue.course;
  const subject = issue.subject;
  const professor = issue.professor;
  const workloadLink = course && {
    to: `/cursos/${course.id}/carga`,
    label: t('schedule.readiness.links.workload', { course: course.name }),
  };
  const availabilityLink = professor && {
    to: `/profesores/${professor.id}/disponibilidad`,
    label: t('schedule.readiness.links.availability', { professor: professorName(professor) }),
  };
  const summaryLink = { to: '/profesores/resumen', label: t('schedule.readiness.links.summary') };

  const params = {
    course: course?.name ?? '',
    subject: subject?.name ?? '',
    class: issue.schoolClass?.name ?? '',
    professor: professorName(professor),
    calendar: issue.calendar?.name ?? '',
    classes: names(issue.classes),
    courses: names(issue.courses),
    assigned: issue.assigned ?? 0,
    available: issue.available ?? 0,
  };

  let text: string;
  let links: ({ to: string; label: string } | undefined)[] = [];
  switch (issue.code) {
    case 'SCHOOL_WITHOUT_COURSES':
      text = t('schedule.readiness.issues.SCHOOL_WITHOUT_COURSES');
      links = [{ to: '/cursos/nuevo', label: t('schedule.readiness.links.createCourse') }];
      break;
    case 'COURSE_WITHOUT_CALENDAR':
      text = t('schedule.readiness.issues.COURSE_WITHOUT_CALENDAR', params);
      links = [{ to: '/calendarios', label: t('schedule.readiness.links.calendars') }];
      break;
    case 'WORKLOAD_EXCEEDS_SLOTS':
    case 'BLOCK_LARGER_THAN_LOAD':
    case 'SUBJECT_DOES_NOT_FIT':
    case 'COURSE_WITHOUT_SUBJECTS':
      text = t(`schedule.readiness.issues.${issue.code}`, params);
      links = [workloadLink];
      break;
    case 'WORKLOAD_BELOW_SLOTS':
      text = t('schedule.readiness.issues.WORKLOAD_BELOW_SLOTS', {
        ...params,
        count: Math.max(params.available - params.assigned, 0),
      });
      links = [workloadLink];
      break;
    case 'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR':
      text = t('schedule.readiness.issues.SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR', params);
      links = [availabilityLink, workloadLink];
      break;
    case 'CLASSES_WITHOUT_PROFESSOR':
      text = t('schedule.readiness.issues.CLASSES_WITHOUT_PROFESSOR', {
        ...params,
        count: issue.classes?.length ?? 0,
      });
      links = [
        course && {
          to: `/cursos/${course.id}/profesores`,
          label: t('schedule.readiness.links.assignments', { course: course.name }),
        },
      ];
      break;
    case 'EXCEEDS_MAX_HOURS':
    case 'MAY_EXCEED_MAX_HOURS':
      text = t(`schedule.readiness.issues.${issue.code}`, params);
      links = [summaryLink];
      break;
    case 'SEVERAL_CALENDARS':
      text = t('schedule.readiness.issues.SEVERAL_CALENDARS', {
        ...params,
        count: issue.count ?? 0,
      });
      links = [summaryLink];
      break;
    case 'AVAILABILITY_INSUFFICIENT':
      text = t('schedule.readiness.issues.AVAILABILITY_INSUFFICIENT', {
        ...params,
        count: issue.sessions ?? 0,
      });
      links = [availabilityLink];
      break;
    case 'SUBJECT_INACTIVE':
      text = t('schedule.readiness.issues.SUBJECT_INACTIVE', params);
      links = [
        subject && {
          to: `/asignaturas/${subject.id}/editar`,
          label: t('schedule.readiness.links.editSubject', { subject: subject.name }),
        },
      ];
      break;
    case 'COURSE_WITHOUT_CLASSES':
      text = t('schedule.readiness.issues.COURSE_WITHOUT_CLASSES', params);
      links = [
        course && {
          to: `/cursos/${course.id}/editar`,
          label: t('schedule.readiness.links.editCourse', { course: course.name }),
        },
      ];
      break;
    case 'SLOTS_OUTSIDE_CALENDAR':
      text = t('schedule.readiness.issues.SLOTS_OUTSIDE_CALENDAR', {
        ...params,
        count: issue.count ?? 0,
      });
      links = [
        course &&
          subject && {
            to: `/cursos/${course.id}/carga/${subject.id}/prohibidas`,
            label: t('schedule.readiness.links.forbiddenSlots', { subject: subject.name }),
          },
      ];
      break;
    case 'PREFERRED_SLOTS_FORBIDDEN':
      text = t('schedule.readiness.issues.PREFERRED_SLOTS_FORBIDDEN', {
        ...params,
        count: issue.count ?? 0,
      });
      links = [
        course &&
          subject && {
            to: `/cursos/${course.id}/carga/${subject.id}/preferidas`,
            label: t('schedule.readiness.links.preferredSlots', { subject: subject.name }),
          },
      ];
      break;
  }

  return (
    <li className="cs-list-item d-flex flex-wrap align-items-baseline gap-2">
      <Badge
        bg={kind === 'blocking' ? 'danger' : 'warning'}
        text={kind === 'blocking' ? undefined : 'dark'}
      >
        {t(`schedule.readiness.kind.${kind}`)}
      </Badge>
      <span>{text}</span>
      <span className="d-inline-flex flex-wrap gap-2">
        {links.map(
          (link) =>
            link && (
              <Link key={link.to} to={link.to}>
                {link.label}
              </Link>
            ),
        )}
      </span>
    </li>
  );
}
