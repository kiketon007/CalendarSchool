import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}w${sequence}`;
  return {
    schoolName: `Colegio Carga ${id}`,
    email: `carga.${id}@example.com`,
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

const texts = es.workload;

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

/** Una jornada de `count` sesiones de 45 minutos seguidas. */
function sessions(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const hour = String(9 + index).padStart(2, '0');
    return { type: 'SESSION', startTime: `${hour}:00`, endTime: `${hour}:45` };
  });
}

/** Crea un calendario por la API con los cursos dados. */
function createCalendarViaApi(name: string, courseIds: string[], sessionCount: number) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/calendars',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { name, periods: sessions(sessionCount), courseIds },
    }).then((response) => {
      expect(response.status).to.equal(201);
    });
  });
}

/** Crea una asignatura por la API, con 2 sesiones por curso, y da su id. */
function createSubjectViaApi(name: string, courseIds: string[], use?: (subjectId: string) => void) {
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
        color: 'blue',
        courses: courseIds.map((courseId) => ({ courseId, sessionsPerWeek: 2 })),
      },
    }).then((response) => {
      expect(response.status).to.equal(201);
      use?.((response.body as { data: { subject: { id: string } } }).data.subject.id);
    });
  });
}

/** Fija por la API la fila de una asignatura en un curso: sesiones y reglas (`null`, sin la regla). */
function setRulesViaApi(
  courseId: string,
  subjectId: string,
  row: { sessionsPerWeek: number | null; maxPerDay: number | null; blockSize: number | null },
) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'PATCH',
      url: `/api/courses/${courseId}/workload`,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { changes: [{ subjectId, ...row }] },
    }).then((response) => {
      expect(response.status).to.equal(200);
    });
  });
}

/** Borra un curso por la API, como lo haría otra persona mientras esta tiene abierta su carga. */
function deleteCourseViaApi(courseId: string) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'DELETE',
      url: `/api/courses/${courseId}`,
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((response) => {
      expect(response.status).to.equal(200);
    });
  });
}

/** Entra con una cuenta `MEMBER` del colegio del administrador (la aplicación aún no la crea sola). */
function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('carga.', 'miembro.');
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

const workloadLink = (course: string) =>
  cy.get(`a[aria-label="${es.courses.actions.workloadCourse.replace('{{name}}', course)}"]`);
const sessionsSelect = (subject: string) =>
  cy.get(`select[aria-label="${texts.matrix.select.replace('{{subject}}', subject)}"]`);
const maxPerDaySelect = (subject: string) =>
  cy.get(`select[aria-label="${texts.matrix.maxPerDaySelect.replace('{{subject}}', subject)}"]`);
const blockSizeSelect = (subject: string) =>
  cy.get(`select[aria-label="${texts.matrix.blockSizeSelect.replace('{{subject}}', subject)}"]`);
const saveButton = () => cy.contains('button', texts.save);
const balance = (text: string) => cy.contains('p', text);

/** Tarjeta de la asignatura en el listado. */
const subjectCard = (name: string) =>
  cy.contains('article h2', new RegExp(`^${name}$`)).closest('article');

describe('Carga horaria de un curso', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/courses/*/workload').as('getWorkload');
    cy.intercept('PATCH', '/api/courses/*/workload').as('updateWorkload');
  });

  it('opens the workload from the courses, adjusts it and sees it in the subjects', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('2º Primaria', (second) => {
      createSubjectViaApi('Música', [second]);
    });
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada de seis', [first], 6);
      createSubjectViaApi('Inglés', [first]);
      createSubjectViaApi('Lengua', [first]);
    });
    cy.visit('/cursos');

    workloadLink('1º Primaria').click();
    cy.wait('@getWorkload');
    cy.location('pathname').should('match', /^\/cursos\/[^/]+\/carga$/);
    cy.contains('h1', 'Carga horaria de 1º Primaria').should('be.visible');
    balance('4 de 30 sesiones a la semana').should('be.visible');
    sessionsSelect('Inglés').should('have.value', '2');
    sessionsSelect('Música').should('have.value', '');
    saveButton().should('be.disabled');

    sessionsSelect('Inglés').select('4');
    saveButton().should('be.enabled');
    sessionsSelect('Inglés').select('2');
    saveButton().should('be.disabled');

    sessionsSelect('Inglés').select('4');
    sessionsSelect('Música').select('3');
    sessionsSelect('Lengua').select(texts.matrix.notTaught);
    balance('7 de 30 sesiones a la semana').should('be.visible');
    saveButton().click();

    cy.wait('@updateWorkload')
      .its('request.body.changes')
      .should('have.length', 3)
      .then((changes: { sessionsPerWeek: number | null }[]) => {
        expect(changes.map(({ sessionsPerWeek }) => sessionsPerWeek).sort()).to.deep.equal([
          3,
          4,
          null,
        ]);
      });
    cy.contains(texts.saved.replace('{{course}}', '1º Primaria')).should('be.visible');
    saveButton().should('be.disabled');
    sessionsSelect('Música').should('have.value', '3');

    cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.subjects).click();
    subjectCard('Inglés').find('button[aria-expanded]').click();
    subjectCard('Inglés').should('contain', '1º Primaria: 4 sesiones');
    subjectCard('Música').find('button[aria-expanded]').click();
    subjectCard('Música').should('contain', '1º Primaria: 3 sesiones');
    subjectCard('Música').should('contain', '2º Primaria: 2 sesiones');
    subjectCard('Lengua').should('contain', es.subjects.list.noCourses);
  });

  it('warns that the load does not fit the calendar, saves it anyway and keeps the warning', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Una sola sesión', [first], 1);
      createSubjectViaApi('Inglés', [first]);
      createSubjectViaApi('Lengua', [first]);
    });
    cy.visit('/cursos');
    workloadLink('1º Primaria').click();
    cy.wait('@getWorkload');
    balance('4 de 5 sesiones a la semana').should('be.visible');
    cy.contains('[role="status"]', 'La carga supera').should('not.exist');

    sessionsSelect('Inglés').select('5');
    sessionsSelect('Lengua').select('5');

    balance('10 de 5 sesiones a la semana').should('be.visible');
    cy.get('.progress-bar').should('have.class', 'bg-danger');
    cy.contains(
      '[role="status"]',
      'La carga supera en 5 las sesiones del calendario Una sola sesión',
    ).should('be.visible');
    saveButton().click();
    cy.wait('@updateWorkload').its('response.statusCode').should('equal', 200);
    cy.contains(texts.saved.replace('{{course}}', '1º Primaria')).should('be.visible');

    cy.reload();
    cy.wait('@getWorkload');
    balance('10 de 5 sesiones a la semana').should('be.visible');
    cy.contains(
      '[role="status"]',
      'La carga supera en 5 las sesiones del calendario Una sola sesión',
    ).should('be.visible');
  });

  it('says that a course without a calendar cannot be compared, links to the calendars and still saves', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createSubjectViaApi('Inglés', [first]);
    });
    cy.visit('/cursos');
    workloadLink('1º Primaria').click();
    cy.wait('@getWorkload');

    cy.contains('[role="status"]', texts.warnings.COURSE_WITHOUT_CALENDAR).should('be.visible');
    cy.contains('.alert', texts.warnings.COURSE_WITHOUT_CALENDAR).should(
      'have.class',
      'alert-danger',
    );
    cy.contains('[role="status"] a', texts.warnings.calendarsLink).should(
      'have.attr',
      'href',
      '/calendarios',
    );
    cy.contains('p', '2 sesiones asignadas a la semana').should('be.visible');
    cy.contains('p', /\d+ de \d+ sesiones/).should('not.exist');
    cy.get('.progress-bar').should('not.exist');

    sessionsSelect('Inglés').select('3');
    saveButton().click();
    cy.wait('@updateWorkload').its('response.statusCode').should('equal', 200);
    cy.contains('p', '3 sesiones asignadas a la semana').should('be.visible');
  });

  it('shows that the course is gone when another person deletes it while this one edits', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createSubjectViaApi('Inglés', [first]);
      cy.visit('/cursos');
      workloadLink('1º Primaria').click();
      cy.wait('@getWorkload');
      sessionsSelect('Inglés').select('4');

      deleteCourseViaApi(first);
      saveButton().click();

      cy.wait('@updateWorkload').its('response.statusCode').should('equal', 404);
      cy.contains(texts.notFound).should('be.visible');
      cy.contains('a', texts.backToCourses).should('have.attr', 'href', '/cursos');
      cy.get('select').should('not.exist');
    });
  });

  it('invites to create subjects when the school has none', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria');
    cy.visit('/cursos');

    workloadLink('1º Primaria').click();
    cy.wait('@getWorkload');

    cy.contains(texts.noSubjects).should('be.visible');
    cy.contains('a', texts.createSubject).should('have.attr', 'href', '/asignaturas/nueva');
    saveButton().should('not.exist');
  });

  it('lets a member see the workload without editing it', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada de seis', [first], 6);
      createSubjectViaApi('Inglés', [first]);
      createSubjectViaApi('Lengua', [first]);
    });
    loginAsMember(admin);

    cy.visit('/cursos');
    workloadLink('1º Primaria').click();
    cy.wait('@getWorkload');

    cy.contains('h1', 'Carga horaria de 1º Primaria').should('be.visible');
    balance('4 de 30 sesiones a la semana').should('be.visible');
    cy.contains('li', 'Inglés: 2 sesiones').should('be.visible');
    cy.contains('li', 'Lengua: 2 sesiones').should('be.visible');
    cy.contains(texts.forbidden).should('be.visible');
    cy.get('select').should('not.exist');
    saveButton().should('not.exist');
  });

  describe('the scheduling rules', () => {
    it('puts a maximum per day and a block, saves the whole row and shows the rules in the subjects', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', (first) => {
        createCalendarViaApi('Jornada de seis', [first], 6);
        createSubjectViaApi('Inglés', [first]);
      });
      cy.visit('/cursos');
      workloadLink('1º Primaria').click();
      cy.wait('@getWorkload');
      maxPerDaySelect('Inglés').should('have.value', '');
      blockSizeSelect('Inglés').should('have.value', '');
      saveButton().should('be.disabled');

      sessionsSelect('Inglés').select('4');
      maxPerDaySelect('Inglés').select('2');
      blockSizeSelect('Inglés').select(texts.matrix.blockOf.replace('{{count}}', '2'));
      saveButton().should('be.enabled').click();

      cy.wait('@updateWorkload')
        .its('request.body.changes')
        .then((changes: Record<string, unknown>[]) => {
          expect(changes).to.have.length(1);
          expect(changes[0]).to.include({ sessionsPerWeek: 4, maxPerDay: 2, blockSize: 2 });
        });
      cy.contains(texts.saved.replace('{{course}}', '1º Primaria')).should('be.visible');
      maxPerDaySelect('Inglés').should('have.value', '2');
      blockSizeSelect('Inglés').should('have.value', '2');

      cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.subjects).click();
      subjectCard('Inglés').find('button[aria-expanded]').click();
      subjectCard('Inglés').should('contain', '1º Primaria: 4 sesiones · 2 reglas');
    });

    it('enables "Save" when only a rule changes and clears it with null', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', (first) => {
        createCalendarViaApi('Jornada de seis', [first], 6);
        createSubjectViaApi('Inglés', [first], (english) => {
          setRulesViaApi(first, english, { sessionsPerWeek: 2, maxPerDay: 2, blockSize: null });
        });
      });
      cy.visit('/cursos');
      workloadLink('1º Primaria').click();
      cy.wait('@getWorkload');
      maxPerDaySelect('Inglés').should('have.value', '2');
      saveButton().should('be.disabled');

      maxPerDaySelect('Inglés').select(texts.matrix.maxPerDayDefault);
      saveButton().should('be.enabled').click();

      cy.wait('@updateWorkload')
        .its('request.body.changes.0')
        .should('include', { sessionsPerWeek: 2, maxPerDay: null, blockSize: null });
      cy.contains(texts.saved.replace('{{course}}', '1º Primaria')).should('be.visible');
      maxPerDaySelect('Inglés').should('have.value', '');
    });

    it('warns that the block is larger than the load, keeps saving, and keeps the warning after reloading', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', (first) => {
        createCalendarViaApi('Jornada de seis', [first], 6);
        createSubjectViaApi('Inglés', [first]);
      });
      cy.visit('/cursos');
      workloadLink('1º Primaria').click();
      cy.wait('@getWorkload');
      cy.contains(texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD).should('not.exist');

      blockSizeSelect('Inglés').select(texts.matrix.blockOf.replace('{{count}}', '3'));

      cy.contains('[role="status"]', texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD).should(
        'be.visible',
      );
      saveButton().click();
      cy.wait('@updateWorkload').its('response.statusCode').should('equal', 200);

      cy.reload();
      cy.wait('@getWorkload');
      cy.contains('[role="status"]', texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD).should(
        'be.visible',
      );

      blockSizeSelect('Inglés').select(texts.matrix.noBlocks);
      cy.contains(texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD).should('not.exist');
    });

    it('warns that a subject does not fit when a break cuts the block', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', (first) => {
        withAccessToken((accessToken) => {
          cy.request({
            method: 'POST',
            url: '/api/calendars',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: {
              name: 'Con recreo',
              courseIds: [first],
              periods: [
                { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
                { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
                { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
                { type: 'SESSION', startTime: '11:00', endTime: '11:45' },
              ],
            },
          }).then((response) => {
            expect(response.status).to.equal(201);
          });
        });
        createSubjectViaApi('Educación Física', [first]);
      });
      cy.visit('/cursos');
      workloadLink('1º Primaria').click();
      cy.wait('@getWorkload');

      sessionsSelect('Educación Física').select('3');
      blockSizeSelect('Educación Física').select(texts.matrix.blockOf.replace('{{count}}', '3'));
      cy.contains('[role="status"]', texts.subjectWarnings.SUBJECT_DOES_NOT_FIT).should(
        'be.visible',
      );

      blockSizeSelect('Educación Física').select(texts.matrix.blockOf.replace('{{count}}', '2'));
      cy.contains(texts.subjectWarnings.SUBJECT_DOES_NOT_FIT).should('not.exist');
    });

    it('warns that the rules will be deleted when the subject stops being taught, and deletes them on saving', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', (first) => {
        createCalendarViaApi('Jornada de seis', [first], 6);
        createSubjectViaApi('Inglés', [first], (english) => {
          setRulesViaApi(first, english, { sessionsPerWeek: 3, maxPerDay: 2, blockSize: 2 });
        });
      });
      cy.visit('/cursos');
      workloadLink('1º Primaria').click();
      cy.wait('@getWorkload');
      cy.contains('Al guardar se borrarán').should('not.exist');

      sessionsSelect('Inglés').select(texts.matrix.notTaught);

      cy.contains('Al guardar se borrarán sus 2 reglas en este curso').should('be.visible');
      maxPerDaySelect('Inglés').should('be.disabled');
      blockSizeSelect('Inglés').should('be.disabled');
      saveButton().click();
      cy.wait('@updateWorkload')
        .its('request.body.changes.0')
        .should('include', { sessionsPerWeek: null, maxPerDay: null, blockSize: null });
      cy.contains(texts.saved.replace('{{course}}', '1º Primaria')).should('be.visible');
      cy.contains('Al guardar se borrarán').should('not.exist');

      sessionsSelect('Inglés').select('3');
      maxPerDaySelect('Inglés').should('have.value', '');
      blockSizeSelect('Inglés').should('have.value', '');
    });

    it('lets a member see the rules as text, without selectors', () => {
      const admin = uniqueAdmin();
      registerViaApi(admin);
      createCourseViaApi('1º Primaria', (first) => {
        createCalendarViaApi('Jornada de seis', [first], 6);
        createSubjectViaApi('Inglés', [first], (english) => {
          setRulesViaApi(first, english, { sessionsPerWeek: 4, maxPerDay: 2, blockSize: 2 });
        });
      });
      loginAsMember(admin);

      cy.visit('/cursos');
      workloadLink('1º Primaria').click();
      cy.wait('@getWorkload');

      cy.contains('li', 'Inglés: 4 sesiones · como mucho 2 al día · en bloques de 2').should(
        'be.visible',
      );
      cy.get('select').should('not.exist');
      saveButton().should('not.exist');
    });

    it('fits the matrix with rules on a 360 px screen without horizontal scrolling', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', (first) => {
        createCalendarViaApi('Jornada de seis', [first], 6);
        createSubjectViaApi('Inglés', [first], (english) => {
          setRulesViaApi(first, english, { sessionsPerWeek: 3, maxPerDay: 2, blockSize: 2 });
        });
        createSubjectViaApi(
          'Educación Física y Salud con un nombre muy largo para ver cómo se parte',
          [first],
        );
      });
      cy.viewport(360, 740);
      cy.visit('/cursos');
      workloadLink('1º Primaria').click();
      cy.wait('@getWorkload');
      sessionsSelect('Inglés').select('2');
      blockSizeSelect('Inglés').select(texts.matrix.blockOf.replace('{{count}}', '3'));

      sessionsSelect('Inglés').should('be.visible');
      maxPerDaySelect('Inglés').should('be.visible');
      blockSizeSelect('Inglés').should('be.visible');
      cy.contains(texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD).should('be.visible');
      cy.contains('Al guardar').should('not.exist');
      expectNoHorizontalScroll();
      saveButton().scrollIntoView();
      saveButton().should('be.visible');
    });
  });

  it('fits the courses list and the workload on a 360 px screen without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCalendarViaApi('Jornada de seis', [first], 6);
      createSubjectViaApi(
        'Educación Física y Salud con un nombre muy largo para ver cómo se parte',
        [first],
      );
      createSubjectViaApi('Inglés', [first]);
    });
    cy.viewport(360, 740);

    cy.visit('/cursos');
    workloadLink('1º Primaria').should('be.visible');
    expectNoHorizontalScroll();

    workloadLink('1º Primaria').click();
    cy.wait('@getWorkload');
    sessionsSelect('Inglés').should('be.visible');
    sessionsSelect(
      'Educación Física y Salud con un nombre muy largo para ver cómo se parte',
    ).should('be.visible');
    saveButton().scrollIntoView();
    saveButton().should('be.visible');
    expectNoHorizontalScroll();
  });
});
