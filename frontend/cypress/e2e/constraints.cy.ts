import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}r${sequence}`;
  return {
    schoolName: `Colegio Reglas ${id}`,
    email: `reglas.${id}@example.com`,
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

const texts = es.constraints;

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
function callApi(
  method: 'POST' | 'PUT' | 'PATCH',
  url: string,
  body: object,
  use?: (body: unknown) => void,
) {
  withAccessToken((accessToken) => {
    cy.request({ method, url, headers: { Authorization: `Bearer ${accessToken}` }, body }).then(
      (response) => {
        expect(response.status).to.be.oneOf([200, 201]);
        use?.(response.body);
      },
    );
  });
}

/** Una jornada de periodos de 45 minutos seguidos, todos sesiones. */
function sessionsOf(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const clock = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const start = 9 * 60 + index * 45;
    return { type: 'SESSION', startTime: clock(start), endTime: clock(start + 45) };
  });
}

interface Setup {
  courseId: string;
  english: string;
  religion: string;
}

/**
 * Prepara un colegio con 1º Primaria (calendario de 6 sesiones), Inglés con máximo 2 (sin avisos) y Religión
 * con 5 sesiones, máximo 2 y de lunes a jueves prohibidos (no cabe: avisos en sus dos reglas).
 */
function setUpRules(use: (setup: Setup) => void) {
  callApi('POST', '/api/courses', { name: '1º Primaria', classes: [{ name: 'A' }] }, (course) => {
    const courseId = (course as { data: { course: { id: string } } }).data.course.id;
    callApi(
      'POST',
      '/api/calendars',
      { name: 'Jornada', periods: sessionsOf(6), courseIds: [courseId] },
      () => {
        const subject = (name: string, sessions: number, use2: (id: string) => void) =>
          callApi(
            'POST',
            '/api/subjects',
            {
              name,
              code: null,
              type: 'CORE',
              status: 'ACTIVE',
              color: 'purple',
              courses: [{ courseId, sessionsPerWeek: sessions }],
            },
            (created) => {
              use2((created as { data: { subject: { id: string } } }).data.subject.id);
            },
          );
        subject('Inglés', 3, (english) => {
          subject('Religión', 5, (religion) => {
            callApi('PATCH', `/api/courses/${courseId}/workload`, {
              changes: [
                { subjectId: english, sessionsPerWeek: 3, maxPerDay: 2, blockSize: null },
                { subjectId: religion, sessionsPerWeek: 5, maxPerDay: 2, blockSize: null },
              ],
            });
            callApi('PUT', `/api/courses/${courseId}/subjects/${religion}/forbidden-slots`, {
              slots: [1, 2, 3, 4].flatMap((dayOfWeek) =>
                [1, 2, 3, 4, 5, 6].map((sessionNumber) => ({ dayOfWeek, sessionNumber })),
              ),
            });
            use({ courseId, english, religion });
          });
        });
      },
    );
  });
}

/** Entra con una cuenta `MEMBER` del colegio del administrador (la aplicación aún no la crea sola). */
function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('reglas.', 'miembro.');
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

/** La página no se desplaza en horizontal. */
function expectNoHorizontalScroll() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(
      document.documentElement.clientWidth,
    );
  });
}

const navigationLink = () =>
  cy.contains(`[aria-label="${es.header.navigation}"] a`, es.header.constraints);
const rows = () => cy.get('table tbody tr');
const count = () => cy.get('[data-testid="constraints-count"]');

/** Abre «Reglas» desde la cabecera y espera a que cargue. */
function openConstraints() {
  navigationLink().click();
  cy.wait('@getConstraints');
}

describe('Listado de reglas de reparto', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/constraints').as('getConstraints');
  });

  it('lets an administrator open the list from the navigation and see every rule with its detail, its warnings and the count', () => {
    registerViaApi(uniqueAdmin());
    setUpRules(() => {
      cy.visit('/onboarding');
      openConstraints();
    });

    cy.location('pathname').should('equal', '/reglas');
    cy.contains('h1', texts.title).should('be.visible');
    navigationLink().should('have.attr', 'aria-current', 'page');
    count().should('have.text', '3 reglas');
    rows().should('have.length', 3);
    rows().eq(0).should('contain.text', '1º Primaria').and('contain.text', 'Inglés');
    rows()
      .eq(0)
      .should('contain.text', texts.types.MAX_PER_DAY)
      .and('contain.text', 'Hasta 2 al día');
    rows().eq(0).find('[role="status"]').should('not.exist');
    rows().eq(1).should('contain.text', 'Religión').and('contain.text', texts.types.MAX_PER_DAY);
    rows()
      .eq(2)
      .should('contain.text', texts.types.FORBIDDEN_SLOTS)
      .and('contain.text', '24 franjas');
    rows()
      .eq(2)
      .contains(es.workload.subjectWarnings.SUBJECT_DOES_NOT_FIT)
      .should('have.class', 'text-danger');
    cy.contains('th', texts.fields.course).should('be.visible');
  });

  it('filters by type, by subject, by course and by warnings, combines them and clears them', () => {
    registerViaApi(uniqueAdmin());
    setUpRules(() => {
      cy.visit('/onboarding');
      openConstraints();
    });

    cy.get('#constraints-filter-type').select(texts.types.FORBIDDEN_SLOTS);
    rows().should('have.length', 1).and('contain.text', 'Religión');
    count().should('have.text', '1 regla');

    cy.get('#constraints-filter-type').select(texts.filters.all);
    cy.get('#constraints-search').type('ingl');
    rows().should('have.length', 1).and('contain.text', 'Inglés');

    cy.get('#constraints-search').clear();
    cy.contains('label', texts.filters.onlyWithWarnings).click();
    rows().should('have.length', 2);
    rows().each((row) => {
      expect(row.text()).to.contain('Religión');
    });

    cy.get('#constraints-filter-type').select(texts.types.BLOCK);
    cy.contains(texts.noMatches).should('be.visible');
    count().should('have.text', '0 reglas');
    cy.contains('button', texts.filters.clear).click();
    cy.get('#constraints-search').should('have.focus');
    rows().should('have.length', 3);
    cy.get('#constraints-filter-course').select('1º Primaria');
    rows().should('have.length', 3);
    cy.get('@getConstraints.all').should('have.length', 1);
  });

  it('takes the administrator to the grid of the rule with Edit and to the workload for the maximum per day', () => {
    registerViaApi(uniqueAdmin());
    setUpRules(({ courseId, religion }) => {
      cy.visit('/onboarding');
      openConstraints();
      cy.get(`a[aria-label="Editar ${texts.types.FORBIDDEN_SLOTS} de Religión en 1º Primaria"]`)
        .should('have.text', texts.edit)
        .click();
      cy.location('pathname').should('equal', `/cursos/${courseId}/carga/${religion}/prohibidas`);
      cy.contains('h1', 'Franjas prohibidas de Religión en 1º Primaria').should('be.visible');
    });
  });

  it('shows a member the same rules with View, which opens the workload without any way to edit', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    setUpRules(({ courseId }) => {
      loginAsMember(admin);
      openConstraints();
      rows().should('have.length', 3);
      cy.contains('a', texts.edit).should('not.exist');
      cy.get('a[aria-label="Ver Máximo al día de Inglés en 1º Primaria"]')
        .should('have.text', texts.view)
        .click();
      cy.location('pathname').should('equal', `/cursos/${courseId}/carga`);
      cy.get(
        `ul[aria-label="${es.workload.member.list.replace('{{course}}', '1º Primaria')}"]`,
      ).should('be.visible');
      cy.contains('button', es.workload.save).should('not.exist');
    });
  });

  it('tells a school without rules that there are none and links to the courses', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/onboarding');

    openConstraints();

    cy.contains(texts.empty).should('be.visible');
    cy.get('[role="search"]').should('not.exist');
    cy.contains('a', texts.goToCourses).click();
    cy.location('pathname').should('equal', '/cursos');
  });

  it('draws cards without horizontal scrolling on a 360 px screen, with the same data and links', () => {
    registerViaApi(uniqueAdmin());
    cy.viewport(360, 740);
    setUpRules(() => {
      cy.visit('/onboarding');
      cy.contains(`[aria-label="${es.header.navigation}"] a`, es.header.constraints).click();
      cy.wait('@getConstraints');
    });

    cy.get('table').should('not.exist');
    cy.get(`ul[aria-label="${texts.list}"] > li`).should('have.length', 3);
    cy.get(`ul[aria-label="${texts.list}"] > li`)
      .eq(2)
      .should('contain.text', 'Religión')
      .and('contain.text', texts.types.FORBIDDEN_SLOTS)
      .and('contain.text', es.workload.subjectWarnings.SUBJECT_DOES_NOT_FIT);
    cy.get('a[aria-label^="Editar"]').should('have.length', 3);
    expectNoHorizontalScroll();
    cy.get('#constraints-search').should('be.visible');
  });
});
