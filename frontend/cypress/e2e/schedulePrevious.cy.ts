import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}p${sequence}`;
  return {
    schoolName: `Colegio Anteriores ${id}`,
    email: `anteriores.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestAdmin = ReturnType<typeof uniqueAdmin>;

const confirmTexts = es.schedule.confirm;
const discardTexts = es.schedule.discard;
const exportTexts = es.schedule.export;
const generation = es.schedule.generation;
const previousTexts = es.schedule.previous;
const SUMMARY = 'Horario borrador generado: 6 sesiones colocadas';

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
 * a la semana) y Ana García como profesora de las dos clases.
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

const panel = () => cy.get('[data-testid="schedule-generation-panel"]');
const page = () => cy.get('[data-testid="schedule-draft-page"]');
const listPage = () => cy.get('[data-testid="previous-schedules-page"]');
const dialog = () => cy.get('[role="dialog"]');
const downloaded = (fileName: string) => `${Cypress.config('downloadsFolder')}/${fileName}`;

/** Genera desde `/horarios` y confirma el borrador desde el resumen del panel: queda como el oficial. */
function generateAndConfirmFromPanel() {
  panel().contains(SUMMARY).should('be.visible');
  panel().contains('button', confirmTexts.button).click();
  dialog().contains('button', confirmTexts.confirm).click();
  cy.location('pathname').should('equal', '/horarios/oficial');
}

/** Un colegio con un oficial vigente y otro sustituido: dos confirmaciones seguidas. */
function seedSchoolWithAPreviousSchedule(admin: TestAdmin) {
  seedReadySchool(admin);
  cy.visit('/horarios');
  cy.wait('@getReadiness');
  panel().contains('button', generation.generate).click();
  generateAndConfirmFromPanel();

  cy.visit('/horarios');
  cy.wait('@getReadiness');
  panel().contains('button', generation.generateAgain).click();
  generateAndConfirmFromPanel();
}

function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('anteriores.', 'miembro.');
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

function expectNoHorizontalScroll() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(
      document.documentElement.clientWidth,
    );
  });
}

describe('Ver los horarios oficiales anteriores', () => {
  beforeEach(() => {
    // Chrome no sobrescribe un fichero que ya existe (le añade « (1)»): cada test parte de una carpeta vacía.
    cy.task('deleteDownloads');
    cy.intercept('GET', '/api/schedule/readiness').as('getReadiness');
  });

  it('lists the replaced official, opens it, changes the view and exports it, for an administrator and for a member', () => {
    const admin = uniqueAdmin();
    seedSchoolWithAPreviousSchedule(admin);

    // El enlace del resumen de /horarios y la lista.
    cy.visit('/horarios');
    cy.wait('@getReadiness');
    cy.contains('a', 'Horarios anteriores (1)').click();
    cy.location('pathname').should('equal', '/horarios/anteriores');
    listPage().contains('h1', previousTexts.title).should('be.visible');
    listPage().find('li').should('have.length', 1);
    listPage().find('li').first().should('contain', 'José María García-López');
    listPage().find('li').first().should('contain', 'Vigente hasta el');
    listPage().find('li').first().should('contain', '6 sesiones');

    // El anterior, de solo lectura y con el aviso de los datos de hoy.
    listPage().contains('a', previousTexts.row.view).click();
    cy.location('pathname').should('match', /^\/horarios\/anteriores\/[0-9a-f-]{36}$/u);
    page().contains('h1', previousTexts.page.title).should('be.visible');
    page().contains(previousTexts.page.badge).should('be.visible');
    page().contains('Confirmado el').should('contain', 'José María García-López');
    page().contains('Sustituido el').should('be.visible');
    page().contains(previousTexts.page.notice).should('be.visible');
    cy.get('table').first().contains('Lengua').should('be.visible');
    page().contains('button', confirmTexts.button).should('not.exist');
    page().contains('button', discardTexts.button).should('not.exist');

    // Cambiar de vista sin salir de la página, con el estado en la dirección.
    page().contains('button', es.schedule.draft.views.professor).click();
    cy.location('search').should('contain', 'vista=profesor');
    page().contains('h1', previousTexts.page.title).should('be.visible');

    // Exportarlo: el documento dice cuándo se confirmó y cuándo se sustituyó.
    page().contains('button', exportTexts.button).click();
    dialog().contains('button', exportTexts.download).click();
    dialog().should('not.exist');
    cy.readFile(downloaded('horario-garcia-ana.md')).then((markdown: string) => {
      expect(markdown).to.match(/Horario oficial confirmado el .+ · sustituido el /u);
      expect(markdown).not.to.contain('Borrador generado el');
    });

    // Un miembro ve lo mismo, también sin acciones.
    loginAsMember(admin);
    cy.visit('/horarios/anteriores');
    listPage().find('li').should('have.length', 1);
    listPage().contains('a', previousTexts.row.view).click();
    page().contains(previousTexts.page.badge).should('be.visible');
    cy.get('table').first().contains('Lengua').should('be.visible');
    page().contains('button', exportTexts.button).should('be.visible');
    page().contains('button', confirmTexts.button).should('not.exist');
    page().contains('button', discardTexts.button).should('not.exist');
  });

  it('says there are none when no official was replaced, and that an unknown schedule does not exist', () => {
    seedReadySchool(uniqueAdmin());

    cy.visit('/horarios/anteriores');
    listPage().contains(previousTexts.empty).should('be.visible');
    listPage().contains('a', previousTexts.back).should('have.attr', 'href', '/horarios');

    cy.visit('/horarios/anteriores/0192f5a0-0000-7000-8000-00000000ffff');
    page().contains(previousTexts.page.notFound).should('be.visible');
    page()
      .contains('a', previousTexts.page.notFoundLink)
      .should('have.attr', 'href', '/horarios/anteriores');
  });

  it('shows the list and a previous schedule at 360 px without scrolling the page sideways', () => {
    cy.viewport(360, 740);
    seedSchoolWithAPreviousSchedule(uniqueAdmin());

    cy.visit('/horarios/anteriores');
    listPage().find('li').should('have.length', 1);
    expectNoHorizontalScroll();

    listPage().contains('a', previousTexts.row.view).click();
    page().contains(previousTexts.page.badge).should('be.visible');
    cy.get('table').first().contains('Lengua').should('be.visible');
    expectNoHorizontalScroll();
  });
});
