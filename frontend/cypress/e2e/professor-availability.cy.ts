import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}d${sequence}`;
  return {
    schoolName: `Colegio Disponibilidad ${id}`,
    email: `disponibilidad.${id}@example.com`,
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

const texts = es.availability;
const grid = es.slots.grid;

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

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Una jornada de `count` sesiones seguidas desde las 09:00, cada una de `length` minutos. */
function sessionsOf(count: number, length: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: 'SESSION',
    startTime: clock(540 + index * length),
    endTime: clock(540 + (index + 1) * length),
  }));
}

/** Crea un calendario por la API y lo da por su id. */
function createCalendar(
  name: string,
  periods: object[],
  courseIds: string[],
  use?: (calendarId: string) => void,
) {
  callApi('POST', '/api/calendars', { name, periods, courseIds }, (body) => {
    use?.((body as { data: { calendar: { id: string } } }).data.calendar.id);
  });
}

function createCourse(name: string, use: (courseId: string) => void) {
  callApi('POST', '/api/courses', { name, classes: [{ name: 'A' }] }, (body) => {
    use((body as { data: { course: { id: string } } }).data.course.id);
  });
}

function createProfessor(firstName: string, lastName: string, use: (professorId: string) => void) {
  callApi('POST', '/api/professors', { firstName, lastName }, (body) => {
    use((body as { data: { professor: { id: string } } }).data.professor.id);
  });
}

interface Tramo {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}
const saveViaApi = (professorId: string, unavailable: Tramo[]) => {
  callApi('PUT', `/api/professors/${professorId}/availability`, { unavailable });
};

/** Entra con una cuenta `MEMBER` del colegio del administrador (la aplicación aún no la crea sola). */
function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('disponibilidad.', 'miembro.');
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

const dayName = (day: number) => grid.days[String(day) as '1'];
const cellButton = (day: number, session: number, start: string, end: string) =>
  cy.get(
    `button[aria-label="${grid.cell
      .replace('{{day}}', dayName(day))
      .replace('{{number}}', String(session))
      .replace('{{start}}', start)
      .replace('{{end}}', end)}"]`,
  );
const dayHeader = (day: number) =>
  cy.get(`button[aria-label="${grid.selectDay.replace('{{day}}', dayName(day))}"]`);
const saveButton = () => cy.contains('button', texts.save);
const availabilityLink = (name: string) =>
  cy.get(`a[aria-label="${es.professors.availabilityLabel.replace('{{name}}', name)}"]`);

/** Abre la disponibilidad de un profesor desde el listado y espera a que cargue. */
function openAvailability(name: string) {
  cy.visit('/profesores');
  availabilityLink(name).click();
  cy.wait('@getAvailability');
}

describe('Disponibilidad de un profesor', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/professors/*/availability').as('getAvailability');
    cy.intercept('PUT', '/api/professors/*/availability').as('putAvailability');
  });

  it('opens the availability from the list, marks a day and a cell, saves and shows the count in the list', () => {
    registerViaApi(uniqueAdmin());
    createCourse('1º Primaria', (course) => {
      createCalendar('Jornada', sessionsOf(6, 45), [course]);
    });
    createProfessor('Ana', 'García', () => undefined);
    openAvailability('García, Ana');

    cy.location('pathname').should('match', /^\/profesores\/[^/]+\/disponibilidad$/);
    cy.contains('h1', 'Disponibilidad de Ana García').should('be.visible');
    cy.contains('30 de 30 franjas disponibles en «Jornada»').should('be.visible');
    cy.get('[aria-pressed="true"]').should('not.exist');
    saveButton().should('be.disabled');

    dayHeader(3).click();
    cellButton(1, 1, '09:00', '09:45').click();
    cy.get('[aria-pressed="true"]').should('have.length', 7);
    cy.contains('23 de 30 franjas disponibles en «Jornada»').should('be.visible');
    saveButton().should('be.enabled').click();

    cy.wait('@putAvailability').then(({ request, response }) => {
      expect((request.body as { unavailable: Tramo[] }).unavailable).to.deep.equal([
        { dayOfWeek: 1, startTime: '09:00', endTime: '09:45' },
        { dayOfWeek: 3, startTime: '09:00', endTime: '13:30' },
      ]);
      expect(response?.statusCode).to.equal(200);
    });
    cy.contains('Disponibilidad de Ana García guardada').should('be.visible');
    saveButton().should('be.disabled');

    cy.contains('a', texts.backToProfessors).click();
    availabilityLink('García, Ana').should('have.text', 'Disponibilidad (2 tramos)');
  });

  it('splits an interval when a cell of the middle is unmarked, and keeps the other ones', () => {
    registerViaApi(uniqueAdmin());
    createCourse('1º Primaria', (course) => {
      createCalendar('Jornada', sessionsOf(6, 45), [course]);
    });
    createProfessor('Ana', 'García', (professor) => {
      saveViaApi(professor, [{ dayOfWeek: 1, startTime: '09:00', endTime: '11:15' }]);
    });
    openAvailability('García, Ana');

    cellButton(1, 2, '09:45', '10:30').should('have.attr', 'aria-pressed', 'true').click();
    cellButton(1, 2, '09:45', '10:30').should('have.attr', 'aria-pressed', 'false');
    saveButton().click();

    cy.wait('@putAvailability').then(({ request }) => {
      expect((request.body as { unavailable: Tramo[] }).unavailable).to.deep.equal([
        { dayOfWeek: 1, startTime: '09:00', endTime: '09:45' },
        { dayOfWeek: 1, startTime: '10:30', endTime: '11:15' },
      ]);
    });
    cy.contains('a', texts.backToProfessors).click();
    availabilityLink('García, Ana').should('have.text', 'Disponibilidad (2 tramos)');
  });

  it('shows a partial cell for another calendar and keeps what the grid does not show', () => {
    registerViaApi(uniqueAdmin());
    createCourse('1º Primaria', (first) => {
      createCourse('2º Primaria', (second) => {
        createCourse('Infantil 3', (third) => {
          createCalendar('Primaria', sessionsOf(6, 45), [first, second]);
          createCalendar('Infantil', sessionsOf(4, 60), [third]);
        });
      });
    });
    createProfessor('Ana', 'García', (professor) => {
      saveViaApi(professor, [
        { dayOfWeek: 1, startTime: '09:00', endTime: '09:45' },
        { dayOfWeek: 5, startTime: '16:00', endTime: '17:00' },
      ]);
    });
    openAvailability('García, Ana');

    cy.get('#availability-calendar option:selected').should('have.text', 'Primaria');
    cy.get('table[aria-label$="Primaria"]').should('exist');
    cellButton(1, 1, '09:00', '09:45').should('have.attr', 'aria-pressed', 'true');
    cy.contains(texts.outside.replace('{{ranges}}', 'Viernes 16:00–17:00')).should('be.visible');

    cy.get('#availability-calendar').select('Infantil');
    cy.get('table[aria-label$="Infantil"]').should('exist');
    cy.get('button[aria-pressed="mixed"]')
      .should('have.length', 1)
      .and('have.attr', 'aria-label')
      .and('match', /^Lunes, sesión 1 \(09:00–10:00\): parcialmente no disponible \(09:00–09:45\)/);

    cellButton(2, 1, '09:00', '10:00').click();
    saveButton().click();
    cy.wait('@putAvailability').then(({ request }) => {
      expect((request.body as { unavailable: Tramo[] }).unavailable).to.deep.equal([
        { dayOfWeek: 1, startTime: '09:00', endTime: '09:45' },
        { dayOfWeek: 2, startTime: '09:00', endTime: '10:00' },
        { dayOfWeek: 5, startTime: '16:00', endTime: '17:00' },
      ]);
    });
  });

  it('asks before making everything available when there are intervals outside the grid', () => {
    registerViaApi(uniqueAdmin());
    createCourse('1º Primaria', (course) => {
      createCalendar('Jornada', sessionsOf(6, 45), [course]);
    });
    createProfessor('Ana', 'García', (professor) => {
      saveViaApi(professor, [
        { dayOfWeek: 1, startTime: '09:00', endTime: '09:45' },
        { dayOfWeek: 5, startTime: '16:00', endTime: '17:00' },
      ]);
    });
    openAvailability('García, Ana');

    cy.contains('button', texts.availableAll).click();
    cy.contains(texts.confirmAll.replace('{{ranges}}', 'Viernes 16:00–17:00')).should('be.visible');
    cy.contains('button', texts.cancel).click();
    cellButton(1, 1, '09:00', '09:45').should('have.attr', 'aria-pressed', 'true');

    cy.contains('button', texts.availableAll).click();
    cy.contains('button', texts.confirmAllYes).click();
    cy.get('[aria-pressed="true"]').should('not.exist');
    saveButton().click();
    cy.wait('@putAvailability').then(({ request }) => {
      expect((request.body as { unavailable: Tramo[] }).unavailable).to.deep.equal([]);
    });
    cy.contains('a', texts.backToProfessors).click();
    availabilityLink('García, Ana').should('have.text', es.professors.availability);
  });

  it('lets a member edit the availability of a professor', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createCourse('1º Primaria', (course) => {
      createCalendar('Jornada', sessionsOf(6, 45), [course]);
    });
    createProfessor('Ana', 'García', () => undefined);
    loginAsMember(admin);
    openAvailability('García, Ana');

    cellButton(2, 1, '09:00', '09:45').click();
    saveButton().should('be.enabled').click();

    cy.wait('@putAvailability').its('response.statusCode').should('equal', 200);
    cy.contains('Disponibilidad de Ana García guardada').should('be.visible');
  });

  it('explains that there are no calendars, with a link to create one', () => {
    registerViaApi(uniqueAdmin());
    createProfessor('Ana', 'García', () => undefined);
    openAvailability('García, Ana');

    cy.contains(texts.noCalendars).should('be.visible');
    cy.get('table').should('not.exist');
    cy.contains('a', texts.calendarsLink).click();
    cy.location('pathname').should('equal', '/calendarios');
  });

  it('says that the professor does not exist for an unknown id, with a link back', () => {
    registerViaApi(uniqueAdmin());

    cy.visit('/profesores/0192f5a0-0000-7000-8000-00000000ffff/disponibilidad');

    cy.contains('h1', texts.notFound).should('be.visible');
    cy.contains('a', texts.backToProfessors).click();
    cy.location('pathname').should('equal', '/profesores');
  });

  it('fits the grid on a 360 px screen without horizontal scrolling and with the days abbreviated', () => {
    registerViaApi(uniqueAdmin());
    createCourse('1º Primaria', (course) => {
      createCalendar('Jornada', sessionsOf(6, 45), [course]);
    });
    createProfessor('Ana', 'García', (professor) => {
      saveViaApi(professor, [{ dayOfWeek: 2, startTime: '09:20', endTime: '09:30' }]);
    });
    cy.viewport(360, 740);
    openAvailability('García, Ana');

    cy.get('table').should('be.visible');
    cy.get('button[aria-pressed="mixed"]').should('have.length', 1);
    cy.contains('th button span', 'X').should('be.visible');
    expectNoHorizontalScroll();
    cy.contains('button', texts.availableAll).should('be.visible');
    saveButton().should('be.visible');
  });
});
