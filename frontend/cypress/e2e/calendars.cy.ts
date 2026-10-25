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

interface ApiPeriod {
  type: 'SESSION' | 'BREAK';
  startTime: string;
  endTime: string;
}

/** Seis sesiones de 45 minutos desde las 09:00, sin recreo. */
const SIX_SESSIONS: ApiPeriod[] = [
  ['09:00', '09:45'],
  ['09:45', '10:30'],
  ['10:30', '11:15'],
  ['11:15', '12:00'],
  ['12:00', '12:45'],
  ['12:45', '13:30'],
].map(([startTime, endTime]) => ({ type: 'SESSION' as const, startTime, endTime }));

/** La jornada de Primaria: seis sesiones de 45 minutos con un recreo de 30 tras la tercera. */
const PRIMARY_DAY: ApiPeriod[] = [
  ['SESSION', '09:00', '09:45'],
  ['SESSION', '09:45', '10:30'],
  ['SESSION', '10:30', '11:15'],
  ['BREAK', '11:15', '11:45'],
  ['SESSION', '11:45', '12:30'],
  ['SESSION', '12:30', '13:15'],
  ['SESSION', '13:15', '14:00'],
].map(([type, startTime, endTime]) => ({ type, startTime, endTime }) as ApiPeriod);

/**
 * Crea un calendario por la API (por defecto, seis sesiones de 45 minutos) con los cursos dados y da su `id`.
 */
function createCalendarViaApi(
  name: string,
  courseIds: string[] = [],
  options: { periods?: ApiPeriod[]; use?: (calendarId: string) => void } = {},
) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/calendars',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { name, periods: options.periods ?? SIX_SESSIONS, courseIds },
    }).then((response) => {
      expect(response.status).to.equal(201);
      options.use?.((response.body as { data: { calendar: { id: string } } }).data.calendar.id);
    });
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

  it('orders the rows by time when saving a break that was added at the end and moved', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/calendarios/nuevo');

    nameField().type('Con recreo');
    cy.contains('button', form.periods.addBreak).click();
    periodField('Inicio del recreo 1').should('have.value', '13:30');
    periodField('Inicio del recreo 1').type('11:15');
    periodField('Fin del recreo 1').type('11:45');
    periodField('Inicio de la sesión 4').type('11:45');
    periodField('Fin de la sesión 4').type('12:30');
    periodField('Inicio de la sesión 5').type('12:30');
    periodField('Fin de la sesión 5').type('13:15');
    periodField('Inicio de la sesión 6').type('13:15');
    periodField('Fin de la sesión 6').type('14:00');
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    calendarCard('Con recreo')
      .should('contain', 'Sesión 3 · 10:30–11:15')
      .and('contain', 'Recreo · 11:15–11:45')
      .and('contain', 'Sesión 4 · 11:45–12:30')
      .and('contain', 'Sesión 6 · 13:15–14:00')
      .and('contain', '6 sesiones al día · 30 a la semana · 270 minutos lectivos al día');
  });

  it('leaves the table ordered and flags the overlap when the sessions are not moved after the break', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/calendarios/nuevo');

    nameField().type('Solapado');
    cy.contains('button', form.periods.addBreak).click();
    periodField('Inicio del recreo 1').type('11:15');
    periodField('Fin del recreo 1').type('11:45');
    saveButton().click();

    cy.contains(form.errors.time.OVERLAP).should('be.visible');
    cy.location('pathname').should('equal', '/calendarios/nuevo');
    cy.get('[role="group"][aria-label="Recreo 1"]').should('be.visible');
    periodField('Inicio de la sesión 4').should('have.focus');
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

describe('Editar calendarios', () => {
  const editLink = (name: string) => cy.get(`a[aria-label="Editar ${name}"]`);
  /** La casilla de un curso: la etiqueta y el `input` son hermanos, ligados por `for`. */
  const courseCheckbox = (name: string) =>
    cy.contains('label', name).then(($label) => cy.get(`#${$label.attr('for') ?? ''}`));

  it('opens the edition from the list with the saved calendar and nothing to save, and cancel goes back', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createCalendarViaApi('Primaria', [courseId], { periods: PRIMARY_DAY });
    });
    cy.visit('/calendarios');

    editLink('Primaria').click();

    cy.location('pathname').should('match', /^\/calendarios\/.+\/editar$/);
    cy.get('h1').should('have.text', form.editTitle);
    nameField().should('have.value', 'Primaria');
    periodField('Inicio del recreo 1').should('have.value', '11:15');
    periodField('Fin de la sesión 6').should('have.value', '14:00');
    courseCheckbox('1º Primaria').should('be.checked');
    saveButton().should('be.disabled');

    cy.contains('a', form.cancel).click();
    cy.location('pathname').should('equal', '/calendarios');
  });

  it('keeps Save disabled for an outer space or an undone change, and enables it with a real one', () => {
    registerViaApi(uniqueAdmin());
    createCalendarViaApi('Primaria', [], { periods: PRIMARY_DAY });
    cy.visit('/calendarios');
    editLink('Primaria').click();

    nameField().type('  ');
    saveButton().should('be.disabled');
    periodField('Fin de la sesión 6').type('13:50');
    saveButton().should('be.enabled');
    periodField('Fin de la sesión 6').type('14:00');
    saveButton().should('be.disabled');
  });

  it('renames a calendar and shows the notice with the saved name', () => {
    registerViaApi(uniqueAdmin());
    createCalendarViaApi('Primaria', [], { periods: PRIMARY_DAY });
    cy.visit('/calendarios');
    editLink('Primaria').click();

    nameField().type(' 1º ciclo');
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    cy.contains('[role="status"]', 'Calendario «Primaria 1º ciclo» actualizado').should(
      'be.visible',
    );
    calendarCard('Primaria 1º ciclo').should('be.visible');
    cy.contains('article h2', /^Primaria$/).should('not.exist');
  });

  it('moves the break and readjusts the sessions around it', () => {
    registerViaApi(uniqueAdmin());
    createCalendarViaApi('Primaria', [], { periods: PRIMARY_DAY });
    cy.visit('/calendarios');
    editLink('Primaria').click();

    periodField('Fin de la sesión 3').type('11:00');
    periodField('Inicio del recreo 1').type('11:00');
    periodField('Fin del recreo 1').type('11:30');
    periodField('Inicio de la sesión 4').type('11:30');
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    calendarCard('Primaria')
      .should('contain', 'Sesión 3 · 10:30–11:00')
      .and('contain', 'Recreo · 11:00–11:30')
      .and('contain', 'Sesión 4 · 11:30–12:30')
      .and('contain', '6 sesiones al día · 30 a la semana · 270 minutos lectivos al día');
  });

  it('removes a session, and the next ones are renumbered by the order', () => {
    registerViaApi(uniqueAdmin());
    createCalendarViaApi('Primaria', [], { periods: PRIMARY_DAY });
    cy.visit('/calendarios');
    editLink('Primaria').click();

    cy.get('button[aria-label="Quitar la sesión 6"]').click();
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    calendarCard('Primaria')
      .should('contain', '5 sesiones al día · 25 a la semana · 225 minutos lectivos al día')
      .and('not.contain', 'Sesión 6');
  });

  it('frees a course and moves another one from a second calendar, warning of both before saving', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (firstId) => {
      createCourseViaApi('2º Primaria', (secondId) => {
        createCourseViaApi('3º Primaria', (thirdId) => {
          createCalendarViaApi('Primaria', [firstId, secondId]);
          createCalendarViaApi('Infantil', [thirdId]);
        });
      });
    });
    cy.visit('/calendarios');
    editLink('Primaria').click();
    courseCheckbox('1º Primaria').should('be.checked');

    cy.contains('label', '2º Primaria').click();
    cy.contains(form.courses.willFree).should('be.visible');
    cy.contains('label', '3º Primaria').click();
    cy.contains('Ahora sigue «Infantil»: se moverá').should('be.visible');
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    calendarCard('Primaria').should('contain', 'Cursos: 1º Primaria, 3º Primaria');
    calendarCard('Infantil').should('contain', es.calendars.noCourses);
    cy.contains('article', '2º Primaria').should('not.exist');
  });

  it('rejects the name of another calendar, keeps what was typed and saves with another name', () => {
    registerViaApi(uniqueAdmin());
    createCalendarViaApi('Primaria');
    createCalendarViaApi('Infantil');
    cy.visit('/calendarios');
    editLink('Primaria').click();

    nameField().clear();
    nameField().type('infantil');
    saveButton().click();

    cy.contains(form.errors.alreadyExists).should('be.visible');
    cy.location('pathname').should('match', /\/editar$/);
    nameField().should('have.focus');
    nameField().should('have.value', 'infantil');

    nameField().clear();
    nameField().type('Primaria B');
    saveButton().click();

    cy.location('pathname').should('equal', '/calendarios');
    calendarCard('Primaria B').should('be.visible');
    calendarCard('Infantil').should('be.visible');
  });

  it('says that a calendar does not exist, with a link to the list, for an unknown id and for one that is not a UUID', () => {
    registerViaApi(uniqueAdmin());

    cy.visit('/calendarios/0192f5a0-0000-7000-8000-00000000ffff/editar');
    cy.contains(form.notFound).should('be.visible');
    cy.contains('a', form.backToList).should('have.attr', 'href', '/calendarios');

    cy.visit('/calendarios/no-es-un-uuid/editar');
    cy.contains(form.notFound).should('be.visible');
    cy.contains('a', form.backToList).click();
    cy.location('pathname').should('equal', '/calendarios');
  });

  it('lets a member see the calendars without "Edit" and sends them away from the edition', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createCalendarViaApi('Primaria', [], {
      use: (calendarId) => {
        loginAsMember(admin);

        calendarsLink().click();
        calendarCard('Primaria').should('be.visible');
        cy.get('a[aria-label^="Editar"]').should('not.exist');

        cy.visit(`/calendarios/${calendarId}/editar`);
        cy.location('pathname').should('equal', '/onboarding');
      },
    });
  });

  it('fits the edition on a 360 px screen without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    createCalendarViaApi('Primaria', [], { periods: PRIMARY_DAY });
    cy.viewport(360, 740);
    cy.visit('/calendarios');

    editLink('Primaria').click();

    periodField('Fin de la sesión 6').should('be.visible');
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
  });
});
