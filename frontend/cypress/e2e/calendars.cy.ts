import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}c${sequence}`;
  return {
    schoolName: `Colegio Calendarios ${id}`,
    email: `calendarios.${id}@example.com`,
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

const form = es.calendars.form;
const calendarsLink = () =>
  cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.calendars);
const nameField = () => cy.get('#calendar-name');
const saveButton = () => cy.contains('button', form.save);
const periodField = (label: string) => cy.get(`[aria-label="${label}"]`);

/** Vacía un campo y escribe en él, en dos órdenes para no encadenar tras `clear()`. */
function replaceValue(selector: string, text: string) {
  cy.get(selector).clear();
  cy.get(selector).type(text);
}

/** Tarjeta del calendario en el listado. */
const calendarCard = (name: string) =>
  cy.contains('article h2', new RegExp(`^${name}$`)).closest('article');

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

/** Crea un curso por la API y da su id. */
function createCourseViaApi(name: string, use?: (courseId: string) => void) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/courses',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { name, classes: [{ name: 'A' }] },
    }).then((response) => {
      expect(response.status).to.equal(201);
      use?.((response.body as { data: { course: { id: string } } }).data.course.id);
    });
  });
}

/** Crea un calendario de seis sesiones de 45 minutos por la API, con los cursos dados. */
function createCalendarViaApi(name: string, courseIds: string[] = []) {
  const starts = ['09:00', '09:45', '10:30', '11:15', '12:00', '12:45'];
  const ends = ['09:45', '10:30', '11:15', '12:00', '12:45', '13:30'];
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/calendars',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        name,
        periods: starts.map((startTime, index) => ({
          type: 'SESSION',
          startTime,
          endTime: ends[index],
        })),
        courseIds,
      },
    })
      .its('status')
      .should('equal', 201);
  });
}

/** Entra con una cuenta `MEMBER` del colegio del administrador (la aplicación aún no la crea sola). */
function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('calendarios.', 'miembro.');
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

describe('Calendarios', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/calendars').as('listCalendars');
  });

  it('creates Primaria by generating the sessions and shows it with its summary', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria');
    cy.visit('/onboarding');

    calendarsLink().click();
    cy.wait('@listCalendars');
    cy.contains(es.calendars.empty).should('be.visible');
    cy.contains('a', es.calendars.create).click();
    cy.location('pathname').should('equal', '/calendarios/nuevo');

    nameField().type('Primaria');
    cy.get('#calendar-generate-start').should('have.value', '09:00');
    replaceValue('#calendar-generate-count', '6');
    replaceValue('#calendar-generate-duration', '45');
    cy.get('#calendar-generate-with-break').check();
    cy.get('#calendar-generate-break-after').select('3');
    replaceValue('#calendar-generate-break-duration', '30');
    cy.contains('button', form.generate.button).click();
    periodField('Inicio del recreo 1').should('have.value', '11:15');
    periodField('Fin del recreo 1').should('have.value', '11:45');
    periodField('Fin de la sesión 6').should('have.value', '14:00');
    cy.contains('label', '1º Primaria').click();
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    cy.contains('[role="status"]', 'Calendario «Primaria» creado').should('be.visible');
    calendarCard('Primaria')
      .should('contain', '6 sesiones al día · 30 a la semana · 270 minutos lectivos al día')
      .and('contain', 'Sesión 1 · 09:00–09:45')
      .and('contain', 'Recreo · 11:15–11:45')
      .and('contain', 'Sesión 4 · 11:45–12:30')
      .and('contain', 'Cursos: 1º Primaria');
  });

  it('creates Infantil by editing the break and the fourth session by hand', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/calendarios/nuevo');

    nameField().type('Infantil');
    replaceValue('#calendar-generate-count', '4');
    cy.get('#calendar-generate-with-break').check();
    cy.get('#calendar-generate-break-after').select('2');
    replaceValue('#calendar-generate-break-duration', '30');
    cy.contains('button', form.generate.button).click();
    periodField('Fin del recreo 1').should('have.value', '11:00');
    periodField('Fin del recreo 1').type('10:45');
    periodField('Fin de la sesión 4').type('12:15');
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    calendarCard('Infantil')
      .should('contain', '4 sesiones al día · 20 a la semana · 165 minutos lectivos al día')
      .and('contain', 'Recreo · 10:30–10:45')
      .and('contain', 'Sesión 4 · 11:45–12:15')
      .and('contain', es.calendars.noCourses);
  });

  it('moves a course from one calendar to another and warns before', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (firstId) => {
      createCourseViaApi('2º Primaria', (secondId) => {
        createCalendarViaApi('Primaria', [firstId, secondId]);
      });
    });
    cy.visit('/calendarios/nuevo');

    nameField().type('Refuerzo');
    cy.contains('label', '2º Primaria').click();
    cy.contains('Ahora sigue «Primaria»: se moverá').should('be.visible');
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    calendarCard('Refuerzo').should('contain', 'Cursos: 2º Primaria');
    calendarCard('Primaria').should('contain', 'Cursos: 1º Primaria');
  });

  it('rejects a name that already exists, keeps what was typed and saves with another name', () => {
    registerViaApi(uniqueAdmin());
    createCalendarViaApi('Primaria');
    cy.visit('/calendarios/nuevo');

    nameField().type(' primaria ');
    saveButton().click();

    cy.contains(form.errors.alreadyExists).should('be.visible');
    cy.location('pathname').should('equal', '/calendarios/nuevo');
    periodField('Inicio de la sesión 1').should('have.value', '09:00');

    nameField().clear();
    nameField().type('Primaria B');
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    calendarCard('Primaria B').should('be.visible');
    calendarCard('Primaria').should('be.visible');
  });

  it('lets a member see the calendars without the create action and sends them away from the form', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createCalendarViaApi('Primaria');
    loginAsMember(admin);

    calendarsLink().click();
    cy.wait('@listCalendars');
    calendarCard('Primaria').should('be.visible');
    cy.contains(es.calendars.readOnly).should('be.visible');
    cy.contains('a', es.calendars.create).should('not.exist');

    cy.visit('/calendarios/nuevo');
    cy.location('pathname').should('equal', '/onboarding');
  });

  it('fits the form on a 360 px screen without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    cy.viewport(360, 740);

    cy.visit('/calendarios/nuevo');

    periodField('Inicio de la sesión 6').should('be.visible');
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
  });
});
