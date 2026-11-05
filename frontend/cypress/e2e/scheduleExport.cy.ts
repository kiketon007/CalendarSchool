import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}x${sequence}`;
  return {
    schoolName: `Colegio Exportar ${id}`,
    email: `exportar.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestAdmin = ReturnType<typeof uniqueAdmin>;

const texts = es.schedule.export;
const draftTexts = es.schedule.draft;
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

const page = () => cy.get('[data-testid="schedule-draft-page"]');
const dialog = () => cy.get('[role="dialog"]');

/** La fecha local de hoy como `AAAA-MM-DD`: el borrador se genera en este mismo test. */
function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

const downloaded = (fileName: string) => `${Cypress.config('downloadsFolder')}/${fileName}`;

/** Abre `/horarios`, genera, pulsa «Ver horario» y espera al borrador. */
function generateAndOpenDraft() {
  cy.visit('/horarios');
  cy.wait('@getReadiness');
  cy.get('[data-testid="schedule-generation-panel"]')
    .contains('button', generation.generate)
    .click();
  cy.get('[data-testid="schedule-generation-panel"]')
    .contains('Horario borrador generado: 6 sesiones colocadas')
    .should('be.visible');
  cy.get('[data-testid="schedule-generation-panel"]').contains('a', generation.viewDraft).click();
  cy.location('pathname').should('equal', '/horarios/borrador');
  cy.wait('@getDraft');
  page().should('be.visible');
}

function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('exportar.', 'miembro.');
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

describe('Exportar el horario borrador', () => {
  beforeEach(() => {
    // Chrome no sobrescribe un fichero que ya existe (le añade « (1)»): cada test parte de una carpeta vacía.
    cy.task('deleteDownloads');
    cy.intercept('GET', '/api/schedule/readiness').as('getReadiness');
    cy.intercept('GET', '/api/schedule/draft').as('getDraft');
  });

  it('downloads a class as Markdown and all the professors as HTML, with the expected content', () => {
    seedReadySchool(uniqueAdmin());
    generateAndOpenDraft();

    page().contains('button', texts.button).click();
    dialog().should('be.visible').and('contain', texts.title);
    dialog().contains('button', texts.download).click();
    dialog().should('not.exist');

    cy.readFile(downloaded('horario-1o-primaria-a.md')).then((markdown: string) => {
      expect(markdown).to.contain('# Horario de 1º Primaria A');
      expect(markdown).to.contain('| Sesión | Lunes | Martes | Miércoles | Jueves | Viernes |');
      expect(markdown).to.contain('| Sesión 1 (09:00–10:00) | Lengua — García, Ana |');
      expect(markdown.match(/Lengua — García, Ana/gu)).to.have.length(3);
      expect(markdown).to.contain('3 sesiones a la semana');
    });

    page().contains('button', texts.button).click();
    dialog().contains('label', texts.format.html).click();
    dialog().contains('label', texts.kind.professor).click();
    dialog().find('#schedule-export-target').select(texts.target.allProfessors);
    dialog().contains('button', texts.download).click();

    cy.readFile(downloaded(`horarios-profesores-${today()}.html`)).then((html: string) => {
      expect(html.startsWith('<!doctype html>')).to.equal(true);
      expect(html).to.contain('<html lang="es">');
      expect(html).to.contain('Horarios de los profesores');
      expect(html).to.contain('Horario de García, Ana');
      expect(html).to.contain('background-color: #cfe2ff');
      expect(html).not.to.match(/<script|<link|<img|@import|url\(/iu);
    });
  });

  it('starts from what is being seen: the professor view starts on that professor', () => {
    seedReadySchool(uniqueAdmin());
    generateAndOpenDraft();

    page().contains('button', draftTexts.views.professor).click();
    cy.location('search').should('equal', '?vista=profesor');
    page().contains('button', texts.button).click();

    dialog().find('input[type="radio"]:checked').should('have.length', 2);
    dialog().find('#schedule-export-kind-professor').should('be.checked');
    dialog().find('#schedule-export-target').find(':selected').should('contain', 'García, Ana');
  });

  it('does not ask for the draft again nor change the address when it exports', () => {
    seedReadySchool(uniqueAdmin());
    generateAndOpenDraft();
    cy.location('search').then((search) => {
      page().contains('button', texts.button).click();
      dialog().contains('button', texts.download).click();
      cy.readFile(downloaded('horario-1o-primaria-a.md'));

      cy.get('@getDraft.all').should('have.length', 1);
      cy.location('search').should('equal', search);
    });
  });

  it('lets a member export the same timetable', () => {
    const admin = uniqueAdmin();
    seedReadySchool(admin);
    generateAndOpenDraft();

    loginAsMember(admin);
    cy.visit('/horarios/borrador');
    page().contains(draftTexts.badge).should('be.visible');
    page().contains('button', texts.button).click();
    dialog().contains('button', texts.download).click();

    cy.readFile(downloaded('horario-1o-primaria-a.md')).should('contain', 'Lengua — García, Ana');
  });

  it('shows the dialog at 360 px without scrolling the page sideways', () => {
    cy.viewport(360, 740);
    seedReadySchool(uniqueAdmin());
    generateAndOpenDraft();

    page().contains('button', texts.button).click();

    dialog().contains('button', texts.download).should('be.visible');
    dialog().contains('button', texts.cancel).should('be.visible');
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
    dialog().contains('button', texts.cancel).click();
    dialog().should('not.exist');
    page().contains('button', texts.button).should('have.focus');
  });
});
