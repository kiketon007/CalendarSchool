import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}d${sequence}`;
  return {
    schoolName: `Colegio Borrador ${id}`,
    email: `borrador.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestAdmin = ReturnType<typeof uniqueAdmin>;

const texts = es.schedule.draft;
const generation = es.schedule.generation;

function registerViaApi(admin: TestAdmin) {
  return cy.request({
    method: 'POST',
    url: '/api/auth/register',
    body: { ...admin, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
  });
}

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

/**
 * Un colegio listo para generar: «1º Primaria» con las clases A y B, un calendario de tres sesiones, Lengua (3 sesiones
 * a la semana) y Ana como profesora de las dos clases (6 sesiones suyas).
 */
function seedReadySchool(admin: TestAdmin) {
  registerViaApi(admin);
  const ids = { courseId: '', classA: '', classB: '', subjectId: '', professorId: '' };
  callApi(
    'POST',
    '/api/courses',
    { name: '1º Primaria', classes: [{ name: 'A' }, { name: 'B' }] },
    (body) => {
      const course = (
        body as { data: { course: { id: string; classes: { id: string; name: string }[] } } }
      ).data.course;
      ids.courseId = course.id;
      ids.classA = course.classes.find(({ name }) => name === 'A')?.id ?? '';
      ids.classB = course.classes.find(({ name }) => name === 'B')?.id ?? '';
    },
  );
  cy.then(() => {
    callApi('POST', '/api/calendars', {
      name: 'Corto',
      periods: PERIODS,
      courseIds: [ids.courseId],
    });
    callApi(
      'POST',
      '/api/subjects',
      {
        name: 'Lengua',
        type: 'CORE',
        status: 'ACTIVE',
        color: 'blue',
        courses: [{ courseId: ids.courseId, sessionsPerWeek: 3 }],
      },
      (body) => {
        ids.subjectId = (body as { data: { subject: { id: string } } }).data.subject.id;
      },
    );
    callApi('POST', '/api/professors', { firstName: 'Ana', lastName: 'García' }, (body) => {
      ids.professorId = (body as { data: { professor: { id: string } } }).data.professor.id;
    });
  });
  return cy.then(() => {
    callApi('PUT', `/api/courses/${ids.courseId}/assignments`, {
      assignments: [
        { subjectId: ids.subjectId, classId: ids.classA, professorId: ids.professorId },
        { subjectId: ids.subjectId, classId: ids.classB, professorId: ids.professorId },
      ],
    });
    return cy.wrap(ids);
  });
}

function expectNoHorizontalScroll() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(
      document.documentElement.clientWidth,
    );
  });
}

const panel = () => cy.get('[data-testid="schedule-generation-panel"]');
const page = () => cy.get('[data-testid="schedule-draft-page"]');

/** Abre `/horarios`, genera y pulsa «Ver horario». */
function generateAndOpenDraft() {
  cy.visit('/horarios');
  cy.wait('@getReadiness');
  panel().contains('button', generation.generate).click();
  panel().contains('Horario borrador generado: 6 sesiones colocadas').should('be.visible');
  panel().contains('a', generation.viewDraft).click();
  cy.location('pathname').should('equal', '/horarios/borrador');
  page().should('be.visible');
}

function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('borrador.', 'miembro.');
  cy.task('createUser', {
    schoolEmail: admin.email,
    email: memberEmail,
    password: PASSWORD,
    role: 'MEMBER',
  });
  cy.clearCookies();
  cy.visit('/login');
  cy.get('#login-email').type(memberEmail);
  cy.get('#login-password').type(PASSWORD);
  cy.get('button[type="submit"]').click();
  cy.location('pathname').should('equal', '/onboarding');
}

describe('Ver el horario borrador', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/schedule/readiness').as('getReadiness');
    cy.intercept('GET', '/api/schedule/draft').as('getDraft');
  });

  it('opens the draft from the generation summary and shows the timetable of the first class', () => {
    seedReadySchool(uniqueAdmin());

    generateAndOpenDraft();
    cy.wait('@getDraft');

    page().contains(texts.badge).should('be.visible');
    page().contains('h1', texts.title).should('be.visible');
    cy.get('#draft-class').invoke('val').should('not.be.empty');
    cy.get('table[aria-label], table')
      .first()
      .within(() => {
        cy.contains('th', 'Lunes').should('be.visible');
        cy.contains('Sesión 1').should('be.visible');
        cy.get('td').filter(':contains("Lengua")').should('have.length', 3);
        cy.contains('García, Ana').should('be.visible');
      });
    page().contains('3 sesiones a la semana').should('be.visible');
  });

  it('goes through the three views without asking for the draft again, and keeps the view on reload', () => {
    seedReadySchool(uniqueAdmin());
    generateAndOpenDraft();
    cy.wait('@getDraft');

    page().contains('button', texts.views.professor).click();
    cy.location('search').should('equal', '?vista=profesor');
    cy.get('#draft-professor').should('be.visible');
    page().contains('Lengua').should('be.visible');
    page().contains('1º Primaria · A').should('be.visible');
    page().contains('6 sesiones a la semana').should('be.visible');

    page().contains('button', texts.views.school).click();
    cy.location('search').should('equal', '?vista=colegio');
    page().contains('th', '1º Primaria A').should('be.visible');
    page().contains('th', '1º Primaria B').should('be.visible');
    cy.get('#draft-day').select('Miércoles');
    cy.location('search').should('equal', '?vista=colegio&dia=3');

    cy.get('@getDraft.all').should('have.length', 1);

    cy.reload();
    cy.wait('@getDraft');
    cy.location('search').should('equal', '?vista=colegio&dia=3');
    cy.get('#draft-day').should('have.value', '3');
    page().contains('th', '1º Primaria A').should('be.visible');
  });

  it('opens straight on a professor from the address, and ignores a value that does not exist', () => {
    seedReadySchool(uniqueAdmin());
    generateAndOpenDraft();
    cy.get('@getDraft').then(() => {
      withAccessToken((accessToken) => {
        cy.request({
          url: '/api/schedule/draft',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).then((response) => {
          const professorId = (
            response.body as { data: { schedule: { professors: { id: string }[] } } }
          ).data.schedule.professors[0]?.id;
          cy.visit(`/horarios/borrador?vista=profesor&profesor=${professorId ?? ''}`);
          cy.get('#draft-professor').should('have.value', professorId);
          cy.visit('/horarios/borrador?vista=profesor&profesor=no-existe&dia=9');
          cy.get('#draft-professor').should('have.value', professorId);
          page().find('[role="alert"]').should('not.exist');
        });
      });
    });
  });

  it('shows a school without any generation that there is no timetable yet', () => {
    registerViaApi(uniqueAdmin());

    cy.visit('/horarios/borrador');

    page().contains(texts.empty).should('be.visible');
    page().contains('a', texts.emptyLink).click();
    cy.location('pathname').should('equal', '/horarios');
  });

  it('shows a member the same draft', () => {
    const admin = uniqueAdmin();
    seedReadySchool(admin);
    generateAndOpenDraft();

    loginAsMember(admin);
    cy.visit('/horarios/borrador');

    page().contains(texts.badge).should('be.visible');
    cy.get('table').first().contains('Lengua').should('be.visible');
    page().contains('button', texts.views.professor).click();
    page().contains('6 sesiones a la semana').should('be.visible');
  });

  it('is usable at 360 px in every view without scrolling the page sideways', () => {
    cy.viewport(360, 740);
    seedReadySchool(uniqueAdmin());
    generateAndOpenDraft();

    page().contains('th', 'Lunes').should('exist');
    cy.get('table').first().contains('th', 'L').should('be.visible');
    expectNoHorizontalScroll();

    page().contains('button', texts.views.professor).click();
    page().contains('Lengua').should('be.visible');
    expectNoHorizontalScroll();

    page().contains('button', texts.views.school).click();
    page().contains('th', '1º Primaria A').should('exist');
    expectNoHorizontalScroll();
  });
});
