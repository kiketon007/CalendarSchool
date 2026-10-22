import type { Ref } from 'react';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import { useTranslation } from 'react-i18next';
import {
  NO_CLASS,
  NO_COURSE,
  type NamedOption,
  type StudentFilters as Filters,
  type Toggle,
} from '../utils/studentFilters';

/** Máximo de caracteres del texto de búsqueda (el de un nombre más sus apellidos). */
const SEARCH_MAX_LENGTH = 100;

interface StudentFiltersProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Para devolver el foco a la búsqueda al limpiar los filtros. */
  searchRef: Ref<HTMLInputElement>;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  courses: { options: NamedOption[]; withoutCourse: boolean };
  classes: { options: NamedOption[]; withoutClass: boolean };
}

const CLASS_HELP_ID = 'student-filter-class-help';
const SCHOLARSHIP_HELP_ID = 'student-filter-scholarship-help';

/**
 * Barra de búsqueda y filtros del listado de alumnos (US15). No tiene estado propio: pinta lo que recibe y
 * avisa de cada cambio. Cambiar de curso vuelve a «todas las clases» y dejar el comedor en «sí» vuelve a la
 * beca a «todos». La clase y la beca están desactivadas, con una ayuda ligada al campo, mientras no tienen
 * sentido (sin un curso concreto, o sin «Come en el comedor»).
 */
export function StudentFilters({
  query,
  onQueryChange,
  searchRef,
  filters,
  onFiltersChange,
  courses,
  classes,
}: StudentFiltersProps) {
  const { t } = useTranslation();
  const hasConcreteCourse = filters.course !== '' && filters.course !== NO_COURSE;
  const canFilterScholarship = filters.cafeteria === 'yes';

  return (
    <fieldset className="mb-3">
      <legend className="visually-hidden">{t('students.filters.legend')}</legend>
      <Form.Group className="mb-3" controlId="student-search">
        <Form.Label>{t('students.filters.search')}</Form.Label>
        <Form.Control
          ref={searchRef}
          type="search"
          autoComplete="off"
          maxLength={SEARCH_MAX_LENGTH}
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
        />
      </Form.Group>

      <Row xs={1} md={2} lg={4} className="g-3">
        <Col>
          <Form.Group controlId="student-filter-course">
            <Form.Label>{t('students.filters.course')}</Form.Label>
            <Form.Select
              value={filters.course}
              onChange={(event) => {
                onFiltersChange({ ...filters, course: event.target.value, classId: '' });
              }}
            >
              <option value="">{t('students.filters.allCourses')}</option>
              {courses.options.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
              {courses.withoutCourse && <option value={NO_COURSE}>{t('students.noCourse')}</option>}
            </Form.Select>
          </Form.Group>
        </Col>

        <Col>
          <Form.Group controlId="student-filter-class">
            <Form.Label>{t('students.filters.class')}</Form.Label>
            <Form.Select
              value={filters.classId}
              disabled={!hasConcreteCourse}
              aria-describedby={hasConcreteCourse ? undefined : CLASS_HELP_ID}
              onChange={(event) => {
                onFiltersChange({ ...filters, classId: event.target.value });
              }}
            >
              <option value="">{t('students.filters.allClasses')}</option>
              {classes.options.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
              {classes.withoutClass && (
                <option value={NO_CLASS}>{t('students.form.classNone')}</option>
              )}
            </Form.Select>
            {!hasConcreteCourse && (
              <Form.Text id={CLASS_HELP_ID} muted>
                {t('students.filters.classNeedsCourse')}
              </Form.Text>
            )}
          </Form.Group>
        </Col>

        <Col>
          <Form.Group controlId="student-filter-cafeteria">
            <Form.Label>{t('students.filters.cafeteria')}</Form.Label>
            <Form.Select
              value={filters.cafeteria}
              onChange={(event) => {
                onFiltersChange({
                  ...filters,
                  cafeteria: event.target.value as Toggle,
                  scholarship: 'all',
                });
              }}
            >
              <option value="all">{t('students.filters.cafeteriaAll')}</option>
              <option value="yes">{t('students.filters.cafeteriaYes')}</option>
              <option value="no">{t('students.filters.cafeteriaNo')}</option>
            </Form.Select>
          </Form.Group>
        </Col>

        <Col>
          <Form.Group controlId="student-filter-scholarship">
            <Form.Label>{t('students.filters.scholarship')}</Form.Label>
            <Form.Select
              value={filters.scholarship}
              disabled={!canFilterScholarship}
              aria-describedby={canFilterScholarship ? undefined : SCHOLARSHIP_HELP_ID}
              onChange={(event) => {
                onFiltersChange({ ...filters, scholarship: event.target.value as Toggle });
              }}
            >
              <option value="all">{t('students.filters.scholarshipAll')}</option>
              <option value="yes">{t('students.filters.scholarshipYes')}</option>
              <option value="no">{t('students.filters.scholarshipNo')}</option>
            </Form.Select>
            {!canFilterScholarship && (
              <Form.Text id={SCHOLARSHIP_HELP_ID} muted>
                {t('students.filters.scholarshipNeedsCafeteria')}
              </Form.Text>
            )}
          </Form.Group>
        </Col>
      </Row>
    </fieldset>
  );
}
