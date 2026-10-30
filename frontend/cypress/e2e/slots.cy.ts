import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}s${sequence}`;
  return {
    schoolName: `Colegio Franjas ${id}`,
    email: `franjas.${id}@example.com`,
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

const texts = es.slots;
const workloadTexts = es.workload;

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

/** Una jornada de periodos de 45 minutos seguidos: `S` es una sesión y `B`, un recreo. */
function periodsOf(layout: string) {
  return [...layout].map((letter, index) => {
    const start = 9 * 60 + index * 45;
    const clock = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return {
      type: letter === 'B' ? 'BREAK' : 'SESSION',
      startTime: clock(start),
      endTime: clock(start + 45),
    };
  });
}

/** Crea un calendario por la API con los cursos dados y da su id. */
function createCalendarViaApi(
  name: string,
  courseIds: string[],
  layout: string,
  use?: (calendarId: string) => void,
) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/calendars',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { name, periods: periodsOf(layout), courseIds },
    }).then((response) => {
      expect(response.status).to.equal(201);
      use?.((response.body as { data: { calendar: { id: string } } }).data.calendar.id);
    });
  });
}

/** Cambia la jornada de un calendario por la API, como lo haría otra persona. */
function changeCalendarViaApi(
  calendarId: string,
  name: string,
  courseIds: string[],
  layout: string,
) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'PUT',
      url: `/api/calendars/${calendarId}`,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { name, periods: periodsOf(layout), courseIds },
    }).then((response) => {
      expect(response.status).to.equal(200);
    });
  });
}

/** Crea una asignatura por la API con las sesiones dadas en cada curso, y da su id. */
function createSubjectViaApi(
  name: string,
  courseIds: string[],
  sessionsPerWeek: number,
  use?: (subjectId: string) => void,
) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/subjects',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        name,
        code: null,
        type: 'CORE',
        status: 'ACTIVE',
        color: 'purple',
        courses: courseIds.map((courseId) => ({ courseId, sessionsPerWeek })),
      },
    }).then((response) => {
      expect(response.status).to.equal(201);
      use?.((response.body as { data: { subject: { id: string } } }).data.subject.id);
    });
  });
}

/** Guarda por la API las celdas de lunes a viernes con las sesiones dadas de cada día dado. */
function forbidViaApi(courseId: string, subjectId: string, days: number[], sessions: number[]) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'PUT',
      url: `/api/courses/${courseId}/subjects/${subjectId}/forbidden-slots`,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        slots: days.flatMap((dayOfWeek) =>
          sessions.map((sessionNumber) => ({ dayOfWeek, sessionNumber })),
        ),
      },
    }).then((response) => {
      expect(response.status).to.equal(200);
    });
  });
}

/** Entra con una cuenta `MEMBER` del colegio del administrador (la aplicación aún no la crea sola). */
function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('franjas.', 'miembro.');
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

const slotsLink = (subject: string) =>
  cy.get(`a[aria-label="${workloadTexts.matrix.slotsLinkLabel.replace('{{subject}}', subject)}"]`);
const dayHeader = (day: string) =>
  cy.get(`button[aria-label="${texts.grid.selectDay.replace('{{day}}', day)}"]`);
const cellButton = (day: string, session: number, start: string, end: string) =>
  cy.get(
    `button[aria-label="${texts.grid.cell
      .replace('{{day}}', day)
      .replace('{{number}}', String(session))
      .replace('{{start}}', start)
      .replace('{{end}}', end)}"]`,
  );
const saveButton = () => cy.contains('button', texts.save);

/** Abre la carga del curso desde el listado de cursos y espera a que cargue. */
function openWorkload(course: string) {
  cy.visit('/cursos');
  cy.get(
    `a[aria-label="${es.courses.actions.workloadCourse.replace('{{name}}', course)}"]`,
  ).click();
  cy.wait('@getWorkload');
}

describe('Franjas prohibidas de una asignatura', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/courses/*/workload').as('getWorkload');
    cy.intercept('GET', '/api/courses/*/subjects/*/forbidden-slots').as('getSlots');
    cy.intercept('PUT', '/api/courses/*/subjects/*/forbidden-slots').as('putSlots');
  });

  it('opens the grid from the workload, marks whole days with their headers, saves and shows the number in the workload', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada con recreo', [first], 'SSSBSSS');
      createSubjectViaApi('Religión', [first], 2);
    });
    openWorkload('1º Primaria');
    slotsLink('Religión').should('have.text', workloadTexts.matrix.slotsLink);

    slotsLink('Religión').click();
    cy.wait('@getSlots');
    cy.location('pathname').should('match', /^\/cursos\/[^/]+\/carga\/[^/]+\/prohibidas$/);
    cy.contains('h1', 'Franjas prohibidas de Religión en 1º Primaria').should('be.visible');
    cy.contains('td', 'Recreo 11:15–12:00').should('be.visible');
    cy.get('[aria-pressed="true"]').should('not.exist');
    saveButton().should('be.disabled');

    dayHeader('Lunes').click();
    dayHeader('Miércoles').click();
    dayHeader('Viernes').click();
    cy.get('[aria-pressed="true"]').should('have.length', 18);
    saveButton().should('be.enabled').click();

    cy.wait('@putSlots').then(({ request, response }) => {
      expect((request.body as { slots: unknown[] }).slots).to.have.length(18);
      expect(response?.statusCode).to.equal(200);
    });
    cy.contains(texts.saved).should('be.visible');
    saveButton().should('be.disabled');

    cy.contains('a', texts.backToWorkload).click();
    cy.wait('@getWorkload');
    slotsLink('Religión').should('have.text', 'Franjas prohibidas (18)');
  });

  it('turns a column off when it was complete, and empties the rule, which removes the number from the workload', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada', [first], 'SSSSSS');
      createSubjectViaApi('Religión', [first], 2, (religion) => {
        forbidViaApi(first, religion, [2], [1, 2, 3, 4, 5, 6]);
      });
    });
    openWorkload('1º Primaria');
    slotsLink('Religión').should('have.text', 'Franjas prohibidas (6)').click();
    cy.wait('@getSlots');
    cy.get('[aria-pressed="true"]').should('have.length', 6);

    dayHeader('Martes').click();
    cy.get('[aria-pressed="true"]').should('not.exist');
    saveButton().click();

    cy.wait('@putSlots').its('request.body.slots').should('have.length', 0);
    cy.contains(texts.saved).should('be.visible');
    cy.contains('a', texts.backToWorkload).click();
    cy.wait('@getWorkload');
    slotsLink('Religión').should('have.text', workloadTexts.matrix.slotsLink);
  });

  it('warns that the subject does not fit while days are marked, before saving, and saves it anyway', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada', [first], 'SSSSSS');
      createSubjectViaApi('Inglés', [first], 3);
    });
    openWorkload('1º Primaria');
    slotsLink('Inglés').click();
    cy.wait('@getSlots');
    cy.contains(workloadTexts.subjectWarnings.SUBJECT_DOES_NOT_FIT).should('not.exist');

    dayHeader('Lunes').click();
    dayHeader('Martes').click();
    cy.contains(workloadTexts.subjectWarnings.SUBJECT_DOES_NOT_FIT).should('not.exist');
    dayHeader('Miércoles').click();

    cy.contains('[role="status"]', workloadTexts.subjectWarnings.SUBJECT_DOES_NOT_FIT).should(
      'be.visible',
    );
    saveButton().click();
    cy.wait('@putSlots').its('response.statusCode').should('equal', 200);
    cy.contains('[role="status"]', workloadTexts.subjectWarnings.SUBJECT_DOES_NOT_FIT).should(
      'be.visible',
    );

    dayHeader('Miércoles').click();
    cy.contains(workloadTexts.subjectWarnings.SUBJECT_DOES_NOT_FIT).should('not.exist');
  });

  it('shows the warning in the workload, recalculated with the slots while the sessions change', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada', [first], 'SSSSSS');
      createSubjectViaApi('Inglés', [first], 3, (english) => {
        forbidViaApi(first, english, [1, 2], [1, 2, 3, 4, 5, 6]);
      });
    });
    openWorkload('1º Primaria');
    cy.contains(workloadTexts.subjectWarnings.SUBJECT_DOES_NOT_FIT).should('not.exist');

    cy.get(
      `select[aria-label="${workloadTexts.matrix.select.replace('{{subject}}', 'Inglés')}"]`,
    ).select('4');

    cy.contains('[role="status"]', workloadTexts.subjectWarnings.SUBJECT_DOES_NOT_FIT).should(
      'be.visible',
    );
  });

  it('ignores the cells outside the calendar when it gets shorter, warns about them and removes them on saving', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada', [first], 'SSSSSS', (calendar) => {
        createSubjectViaApi('Religión', [first], 2, (religion) => {
          forbidViaApi(first, religion, [1, 2, 3, 4, 5], [1, 6]);
          changeCalendarViaApi(calendar, 'Jornada', [first], 'SSSSS');
        });
      });
    });
    openWorkload('1º Primaria');
    cy.contains('[role="status"]', 'Hay 5 franjas fuera del calendario actual').should(
      'be.visible',
    );
    slotsLink('Religión').should('have.text', 'Franjas prohibidas (5)').click();
    cy.wait('@getSlots');

    cy.get('tbody tr').should('have.length', 5);
    cy.contains(
      '.alert',
      'Hay 5 franjas fuera del calendario actual; se quitarán al guardar',
    ).should('be.visible');
    saveButton().should('be.enabled').click();

    cy.wait('@putSlots').its('request.body.slots').should('have.length', 5);
    cy.contains(texts.saved).should('be.visible');
    cy.contains('.alert', 'fuera del calendario actual').should('not.exist');
  });

  it('offers no link and explains what is missing when the course has no calendar', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createSubjectViaApi('Religión', [first], 2);
    });
    openWorkload('1º Primaria');

    cy.get('a[aria-label^="Franjas prohibidas de"]').should('not.exist');
    cy.contains(workloadTexts.matrix.noCalendarForSlots).should('be.visible');
  });

  it('says that the course has no calendar when the grid is opened by its address', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createSubjectViaApi('Religión', [first], 2, (religion) => {
        cy.visit(`/cursos/${first}/carga/${religion}/prohibidas`);
      });
    });
    cy.wait('@getSlots');

    cy.contains(texts.noCalendar).should('be.visible');
    cy.contains('a', texts.calendarsLink).should('have.attr', 'href', '/calendarios');
    cy.get('table').should('not.exist');
  });

  it('shows that the subject is gone when it stops being taught in the course while the grid is open', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada', [first], 'SSSSSS');
      createSubjectViaApi('Religión', [first], 2, (religion) => {
        cy.visit(`/cursos/${first}/carga/${religion}/prohibidas`);
        cy.wait('@getSlots');
        cellButton('Lunes', 1, '09:00', '09:45').click();
        withAccessToken((accessToken) => {
          cy.request({
            method: 'PATCH',
            url: `/api/courses/${first}/workload`,
            headers: { Authorization: `Bearer ${accessToken}` },
            body: {
              changes: [
                { subjectId: religion, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
              ],
            },
          }).then((response) => {
            expect(response.status).to.equal(200);
          });
        });

        saveButton().click();

        cy.wait('@putSlots').its('response.statusCode').should('equal', 404);
        cy.contains(texts.notFound).should('be.visible');
        cy.contains('a', texts.backToWorkload).should(
          'have.attr',
          'href',
          `/cursos/${first}/carga`,
        );
      });
    });
  });

  it('lets a member see the grid without editing it', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada con recreo', [first], 'SSSBSSS');
      createSubjectViaApi('Religión', [first], 2, (religion) => {
        forbidViaApi(first, religion, [2, 4], [1, 2]);
      });
    });
    loginAsMember(admin);

    openWorkload('1º Primaria');
    slotsLink('Religión').should('have.text', 'Franjas prohibidas (4)').click();
    cy.wait('@getSlots');

    cy.contains('h1', 'Franjas prohibidas de Religión en 1º Primaria').should('be.visible');
    cy.get('table button').should('not.exist');
    cy.get('table').contains(texts.grid.forbiddenMark).should('exist');
    saveButton().should('not.exist');
    cy.contains(texts.forbidden).should('be.visible');
  });

  it('fits the grid with its break on a 360 px screen without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada con recreo', [first], 'SSSBSSS');
      createSubjectViaApi(
        'Educación Física y Salud con un nombre muy largo para ver cómo se parte',
        [first],
        2,
        (subject) => {
          forbidViaApi(first, subject, [1, 3], [1, 2, 3]);
        },
      );
    });
    cy.viewport(360, 740);

    openWorkload('1º Primaria');
    expectNoHorizontalScroll();
    slotsLink('Educación Física y Salud con un nombre muy largo para ver cómo se parte').click();
    cy.wait('@getSlots');

    cy.contains('td', 'Recreo').should('be.visible');
    cellButton('Viernes', 6, '13:30', '14:15').scrollIntoView();
    cellButton('Viernes', 6, '13:30', '14:15').should('be.visible');
    dayHeader('Lunes').should('be.visible');
    expectNoHorizontalScroll();
    saveButton().scrollIntoView();
    saveButton().should('be.visible');
  });
});
