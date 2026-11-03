import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}h${sequence}`;
  return {
    schoolName: `Colegio Horarios ${id}`,
    email: `horarios.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestAdmin = ReturnType<typeof uniqueAdmin>;

/** Alta directa por la API: deja la sesión del administrador en el navegador. */
function registerViaApi(admin: TestAdmin) {
  return cy.request({
    method: 'POST',
    url: '/api/auth/register',
    body: { ...admin, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
  });
}

const texts = es.schedule.readiness;

/** Da el access token de la sesión del navegador (el `refresh` lo emite con la cookie). */
function withAccessToken(use: (accessToken: string) => void) {
  cy.request({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { Origin: 'http://localhost:4173' },
  }).then((refreshed) => {
    use(
      (refreshed.body as { data: { session: { accessToken: string } } }).data.session.accessToken,
    );
  });
}

/** Una petición autenticada por la API que debe responder `200` o `201`. */
function callApi(method: 'POST' | 'PUT', url: string, body: object, use?: (body: unknown) => void) {
  withAccessToken((accessToken) => {
    cy.request({ method, url, headers: { Authorization: `Bearer ${accessToken}` }, body }).then(
      (response) => {
        expect(response.status).to.be.oneOf([200, 201]);
        use?.(response.body);
      },
    );
  });
}

/** Tres sesiones de 60 min: 15 a la semana. */
const PERIODS = [
  { type: 'SESSION', startTime: '09:00', endTime: '10:00' },
  { type: 'SESSION', startTime: '10:00', endTime: '11:00' },
  { type: 'SESSION', startTime: '11:00', endTime: '12:00' },
];

interface CreatedCourse {
  id: string;
  classId: string;
}

function createCourse(name: string, use: (course: CreatedCourse) => void) {
  callApi('POST', '/api/courses', { name, classes: [{ name: 'A' }] }, (body) => {
    const course = (body as { data: { course: { id: string; classes: { id: string }[] } } }).data
      .course;
    use({ id: course.id, classId: course.classes[0]?.id ?? '' });
  });
}

function createSubject(name: string, courseId: string, use: (subjectId: string) => void) {
  callApi(
    'POST',
    '/api/subjects',
    {
      name,
      type: 'CORE',
      status: 'ACTIVE',
      color: 'blue',
      courses: [{ courseId, sessionsPerWeek: 3 }],
    },
    (body) => use((body as { data: { subject: { id: string } } }).data.subject.id),
  );
}

interface Seed {
  course: CreatedCourse;
  subjectId: string;
  professorId: string;
}

/**
 * Un curso «1º Primaria» con calendario, una asignatura de 3 sesiones y un profesor sin asignar: solo falta el profesor
 * (un único bloqueante).
 */
function seedOnlyMissingProfessor(admin: TestAdmin): Cypress.Chainable<Seed> {
  const seed = {} as Seed;
  registerViaApi(admin);
  createCourse('1º Primaria', (course) => {
    seed.course = course;
  });
  cy.then(() => {
    callApi('POST', '/api/calendars', {
      name: 'Corto',
      periods: PERIODS,
      courseIds: [seed.course.id],
    });
    createSubject('Lengua', seed.course.id, (subjectId) => {
      seed.subjectId = subjectId;
    });
    callApi('POST', '/api/professors', { firstName: 'Ana', lastName: 'García' }, (body) => {
      seed.professorId = (body as { data: { professor: { id: string } } }).data.professor.id;
    });
  });
  return cy.then(() => seed);
}

/** Da a la asignatura su profesor en la única clase del curso. */
function assignProfessor(seed: Seed) {
  callApi('PUT', `/api/courses/${seed.course.id}/assignments`, {
    assignments: [
      {
        subjectId: seed.subjectId,
        classId: seed.course.classId,
        professorId: seed.professorId,
      },
    ],
  });
}

/** La página no se desplaza en horizontal. */
function expectNoHorizontalScroll() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(
      document.documentElement.clientWidth,
    );
  });
}

const verdict = () => cy.get('[data-testid="schedule-readiness-verdict"]');

function openReadiness() {
  cy.visit('/horarios');
  cy.wait('@getReadiness');
  cy.contains('h1', texts.title).should('be.visible');
}

describe('Comprobación previa a generar los horarios', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/schedule/readiness').as('getReadiness');
  });

  it('says that a school without courses cannot generate yet', () => {
    registerViaApi(uniqueAdmin());

    openReadiness();

    verdict().should('contain.text', 'No se puede generar todavía: 1 problema');
    cy.contains('h2', 'Impiden generar (1)').should('be.visible');
    cy.contains(texts.issues.SCHOOL_WITHOUT_COURSES).should('be.visible');
    cy.contains('a', texts.links.createCourse).should('have.attr', 'href', '/cursos/nuevo');
    cy.contains(texts.note).should('be.visible');
  });

  it('lists blocking problems and warnings of several kinds, each with a link to where it is fixed', () => {
    registerViaApi(uniqueAdmin());
    createCourse('Sin calendario', (course) => {
      createSubject('Plástica', course.id, () => undefined);
    });
    createCourse('Vacío', (course) => {
      callApi('POST', '/api/calendars', {
        name: 'Corto',
        periods: PERIODS,
        courseIds: [course.id],
      });
    });

    openReadiness();

    verdict().should('contain.text', 'No se puede generar todavía');
    cy.contains('h2', /^Impiden generar \(\d+\)$/).should('be.visible');
    cy.contains('h2', /^Avisos \(\d+\)$/).should('be.visible');
    cy.contains('li', 'Sin calendario tiene asignaturas y no tiene calendario.').within(() => {
      cy.contains(texts.kind.blocking).should('be.visible');
      cy.contains('a', texts.links.calendars).should('have.attr', 'href', '/calendarios');
    });
    cy.contains('li', 'Vacío no tiene asignaturas activas.').within(() => {
      cy.contains(texts.kind.warning).should('be.visible');
    });
  });

  it('takes the user to where a problem is fixed', () => {
    seedOnlyMissingProfessor(uniqueAdmin()).then((seed) => {
      openReadiness();

      cy.contains('a', 'Profesores de 1º Primaria').click();

      cy.location('pathname').should('equal', `/cursos/${seed.course.id}/profesores`);
      cy.get('[data-testid="course-assignments-page"]').should('be.visible');
    });
  });

  it('makes a blocking problem disappear once it is fixed, and then says the school can generate', () => {
    seedOnlyMissingProfessor(uniqueAdmin()).then((seed) => {
      openReadiness();
      verdict().should('contain.text', 'No se puede generar todavía: 1 problema');
      cy.contains('li', 'Lengua no tiene profesor en la clase A.').should('be.visible');

      assignProfessor(seed);
      openReadiness();

      verdict().should('contain.text', texts.verdict.ready);
      cy.contains('h2', /^Impiden generar/).should('not.exist');
      cy.contains('li', 'Lengua no tiene profesor').should('not.exist');
    });
  });

  it('is reachable from the "Schedules" entry of the navigation', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/onboarding');

    cy.get(`[aria-label="${es.header.navigation}"]`).contains('a', es.header.schedule).click();

    cy.location('pathname').should('equal', '/horarios');
    cy.contains('h1', texts.title).should('be.visible');
    cy.get(`[aria-label="${es.header.navigation}"]`)
      .contains('a', es.header.schedule)
      .should('have.attr', 'aria-current', 'page');
  });

  it('is usable at 360 px without horizontal scroll, with and without problems', () => {
    cy.viewport(360, 740);
    registerViaApi(uniqueAdmin());
    createCourse('Sin calendario', (course) => {
      createSubject('Plástica', course.id, () => undefined);
    });

    openReadiness();
    cy.contains('li', 'Sin calendario tiene asignaturas y no tiene calendario.').should(
      'be.visible',
    );
    expectNoHorizontalScroll();
  });
});
