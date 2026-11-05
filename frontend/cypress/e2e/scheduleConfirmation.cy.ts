import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}c${sequence}`;
  return {
    schoolName: `Colegio Confirmar ${id}`,
    email: `confirmar.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestAdmin = ReturnType<typeof uniqueAdmin>;

const confirmTexts = es.schedule.confirm;
const discardTexts = es.schedule.discard;
const officialTexts = es.schedule.official;
const generation = es.schedule.generation;
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

interface Overview {
  draft: { id: string } | null;
  official: { id: string; status: string } | null;
  previousCount: number;
}

/** Lo que dice el servidor que hay ahora, sin pasar por la pantalla. */
function overviewIs(check: (overview: Overview) => void) {
  withAccessToken((accessToken) => {
    cy.request({
      url: '/api/schedule/overview',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((response) => {
      check((response.body as { data: Overview }).data);
    });
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
const dialog = () => cy.get('[role="dialog"]');

/** Abre `/horarios` y genera: el panel enseña el resumen y qué se puede hacer con el borrador. */
function generateInSchedules() {
  cy.visit('/horarios');
  cy.wait('@getReadiness');
  panel().contains('button', generation.generate).click();
  panel().contains(SUMMARY).should('be.visible');
}

/** Genera otra vez desde `/horarios` (ya hay una generación completada en el panel). */
function generateAgain() {
  panel().contains('button', generation.generateAgain).click();
  panel().contains(SUMMARY).should('be.visible');
  panel().contains('a', generation.viewDraft).should('be.visible');
}

function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('confirmar.', 'miembro.');
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

describe('Confirmar el horario oficial', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/schedule/readiness').as('getReadiness');
  });

  it('confirms the draft from its page, shows the official and the summary of the schedules', () => {
    seedReadySchool(uniqueAdmin());
    generateInSchedules();
    panel().contains('a', generation.viewDraft).click();
    cy.location('pathname').should('equal', '/horarios/borrador');

    page().contains('button', confirmTexts.button).click();
    dialog().should('be.visible').and('contain', confirmTexts.title);
    dialog().contains('button', confirmTexts.confirm).click();

    cy.location('pathname').should('equal', '/horarios/oficial');
    page().contains('h1', officialTexts.title).should('be.visible');
    page().contains(confirmTexts.done).should('be.visible');
    page().contains(officialTexts.badge).should('be.visible');
    page().contains('Confirmado el').should('contain', 'José María García-López');
    cy.get('table').first().contains('Lengua').should('be.visible');
    page().contains('button', es.schedule.export.button).should('be.visible');
    page().contains('button', confirmTexts.button).should('not.exist');
    page().contains('button', discardTexts.button).should('not.exist');

    cy.visit('/horarios');
    cy.wait('@getReadiness');
    cy.contains('Horario oficial: confirmado el').should('contain', 'José María García-López');
    cy.contains('a', officialTexts.summary.view).click();
    cy.location('pathname').should('equal', '/horarios/oficial');
    overviewIs((overview) => {
      expect(overview.draft).to.equal(null);
      expect(overview.official?.status).to.equal('OFFICIAL');
    });
  });

  it('replaces the official from the summary of the generation, keeping the old one', () => {
    seedReadySchool(uniqueAdmin());
    generateInSchedules();
    panel().contains('button', confirmTexts.button).click();
    dialog().contains('button', confirmTexts.confirm).click();
    cy.location('pathname').should('equal', '/horarios/oficial');
    cy.visit('/horarios');
    cy.wait('@getReadiness');
    panel().contains(generation.isOfficial).should('be.visible');

    generateAgain();
    panel().contains('button', confirmTexts.button).click();
    dialog().should('contain', 'Sustituirá al horario oficial confirmado el');
    dialog().contains('button', confirmTexts.confirm).click();

    cy.location('pathname').should('equal', '/horarios/oficial');
    overviewIs((overview) => {
      expect(overview.previousCount).to.equal(1);
      expect(overview.draft).to.equal(null);
    });
  });

  it('discards a draft, which disappears while the official stays', () => {
    seedReadySchool(uniqueAdmin());
    generateInSchedules();
    panel().contains('button', confirmTexts.button).click();
    dialog().contains('button', confirmTexts.confirm).click();
    cy.location('pathname').should('equal', '/horarios/oficial');
    cy.visit('/horarios');
    cy.wait('@getReadiness');
    generateAgain();
    panel().contains('a', generation.viewDraft).click();
    cy.location('pathname').should('equal', '/horarios/borrador');

    page().contains('button', discardTexts.button).click();
    dialog().should('contain', discardTexts.title);
    dialog().contains('button', discardTexts.confirm).click();

    cy.location('pathname').should('equal', '/horarios');
    cy.contains(discardTexts.done).should('be.visible');
    panel().contains(generation.draftGone).should('be.visible');
    cy.contains('Horario oficial: confirmado el').should('be.visible');
    overviewIs((overview) => {
      expect(overview.draft).to.equal(null);
      expect(overview.official?.status).to.equal('OFFICIAL');
    });
  });

  it('shows a member the official and the draft, but no way to confirm or discard it', () => {
    const admin = uniqueAdmin();
    seedReadySchool(admin);
    generateInSchedules();
    panel().contains('button', confirmTexts.button).click();
    dialog().contains('button', confirmTexts.confirm).click();
    cy.location('pathname').should('equal', '/horarios/oficial');
    cy.visit('/horarios');
    cy.wait('@getReadiness');
    generateAgain();

    loginAsMember(admin);
    cy.visit('/horarios');
    cy.wait('@getReadiness');
    cy.contains('Horario oficial: confirmado el').should('be.visible');
    panel().contains('a', generation.viewDraft).should('be.visible');
    panel().contains('button', confirmTexts.button).should('not.exist');

    cy.visit('/horarios/borrador');
    page().contains('button', es.schedule.export.button).should('be.visible');
    page().contains('button', confirmTexts.button).should('not.exist');
    page().contains('button', discardTexts.button).should('not.exist');

    cy.visit('/horarios/oficial');
    page().contains(officialTexts.badge).should('be.visible');
    cy.get('table').first().contains('Lengua').should('be.visible');
    page().contains('button', confirmTexts.button).should('not.exist');
  });

  it('opens both dialogs and the official page at 360 px without scrolling the page sideways', () => {
    cy.viewport(360, 740);
    seedReadySchool(uniqueAdmin());
    generateInSchedules();
    panel().contains('a', generation.viewDraft).click();

    page().contains('button', discardTexts.button).click();
    dialog().contains('button', discardTexts.confirm).should('be.visible');
    expectNoHorizontalScroll();
    dialog().contains('button', discardTexts.cancel).click();
    dialog().should('not.exist');

    page().contains('button', confirmTexts.button).click();
    dialog().contains('button', confirmTexts.confirm).should('be.visible');
    expectNoHorizontalScroll();
    dialog().contains('button', confirmTexts.confirm).click();

    cy.location('pathname').should('equal', '/horarios/oficial');
    page().contains(officialTexts.badge).should('be.visible');
    expectNoHorizontalScroll();
  });
});
