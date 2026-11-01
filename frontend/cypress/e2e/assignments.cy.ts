import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}a${sequence}`;
  return {
    schoolName: `Colegio Asignaciones ${id}`,
    email: `asignaciones.${id}@example.com`,
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

const texts = es.assignments;

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

interface Seed {
  courseId: string;
  classA: string;
  classB: string;
  english: string;
  language: string;
  ana: string;
  luis: string;
  admin: TestAdmin;
}

/**
 * Un curso «1º Primaria» con las clases A (tutora: Ana García) y B, las asignaturas Inglés (3 sesiones) y Lengua (4)
 * y un segundo profesor, Luis Pérez. Las celdas son 4.
 */
function seed(admin: TestAdmin): Cypress.Chainable<Seed> {
  const ids = { admin } as Seed;
  registerViaApi(admin);
  callApi(
    'POST',
    '/api/courses',
    { name: '1º Primaria', classes: [{ name: 'A' }, { name: 'B' }] },
    (body) => {
      const course = (body as { data: { course: { id: string; classes: { id: string }[] } } }).data
        .course;
      ids.courseId = course.id;
      ids.classA = course.classes[0]?.id ?? '';
      ids.classB = course.classes[1]?.id ?? '';
    },
  );
  const subject = (name: string, color: string, sessions: number, use: (id: string) => void) => {
    callApi(
      'POST',
      '/api/subjects',
      {
        name,
        type: 'CORE',
        status: 'ACTIVE',
        color,
        courses: [{ courseId: ids.courseId, sessionsPerWeek: sessions }],
      },
      (body) => {
        use((body as { data: { subject: { id: string } } }).data.subject.id);
      },
    );
  };
  // Los cursos se resuelven al ejecutar la cola de Cypress, no al construirla.
  cy.then(() => {
    subject('Inglés', 'blue', 3, (id) => (ids.english = id));
    subject('Lengua', 'green', 4, (id) => (ids.language = id));
    callApi(
      'POST',
      '/api/professors',
      { firstName: 'Ana', lastName: 'García', classId: ids.classA },
      (body) => {
        ids.ana = (body as { data: { professor: { id: string } } }).data.professor.id;
      },
    );
    callApi('POST', '/api/professors', { firstName: 'Luis', lastName: 'Pérez' }, (body) => {
      ids.luis = (body as { data: { professor: { id: string } } }).data.professor.id;
    });
  });
  return cy.then(() => ids);
}

/** Guarda por la API las asignaciones dadas como `[asignatura, clase, profesor]`. */
function assignViaApi(ids: Seed, cells: [string, string, string][]) {
  callApi('PUT', `/api/courses/${ids.courseId}/assignments`, {
    assignments: cells.map(([subjectId, classId, professorId]) => ({
      subjectId,
      classId,
      professorId,
    })),
  });
}

/** Entra con una cuenta `MEMBER` del colegio del administrador (la aplicación aún no la crea sola). */
function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('asignaciones.', 'miembro.');
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

const cellSelect = (subject: string, className: string) =>
  cy.get(
    `select[aria-label="${texts.select.replace('{{subject}}', subject).replace('{{class}}', className)}"]`,
  );
const tutorButton = (className: string) =>
  cy.get(`button[aria-label="${texts.assignTutorLabel.replace('{{class}}', className)}"]`);
const saveButton = () => cy.contains('button', texts.save);
const missing = (count: number, total: number) =>
  texts.missing.replace('{{missing}}', String(count)).replace('{{total}}', String(total));

/** Abre los profesores del curso desde «Cursos» y espera a que cargue la matriz. */
function openFromCourses() {
  cy.visit('/cursos');
  cy.get('a[aria-label="Profesores de 1º Primaria"]').click();
  cy.wait('@getAssignments');
  cy.location('pathname').should('match', /^\/cursos\/[^/]+\/profesores$/);
}

describe('Profesores de un curso', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/courses/*/assignments').as('getAssignments');
    cy.intercept('PUT', '/api/courses/*/assignments').as('putAssignments');
  });

  it('opens the professors of a course from "Courses", assigns, uses "Assign the tutor", saves and shows the counts', () => {
    seed(uniqueAdmin()).then((ids) => {
      openFromCourses();

      cy.contains('h1', 'Profesores de 1º Primaria').should('be.visible');
      cy.contains(missing(4, 4)).should('be.visible');
      saveButton().should('be.disabled');

      cellSelect('Inglés', 'B').select(ids.luis);
      cy.contains(missing(3, 4)).should('be.visible');
      tutorButton('A').click();
      cellSelect('Inglés', 'A').should('have.value', ids.ana);
      cellSelect('Lengua', 'A').should('have.value', ids.ana);
      cellSelect('Lengua', 'B').should('have.value', '');
      cellSelect('Inglés', 'B').should('have.value', ids.luis);
      cy.contains(missing(1, 4)).should('be.visible');

      saveButton().should('be.enabled').click();
      cy.wait('@putAssignments').its('response.statusCode').should('equal', 200);
      cy.contains(texts.saved.replace('{{course}}', '1º Primaria')).should('be.visible');
      saveButton().should('be.disabled');
      cy.contains('García, Ana 7 sesiones').should('be.visible');
      cy.contains('Pérez, Luis 3 sesiones').should('be.visible');

      // Lo guardado sobrevive a una recarga.
      cy.reload();
      cy.wait('@getAssignments');
      cellSelect('Lengua', 'A').should('have.value', ids.ana);
      cy.contains(missing(1, 4)).should('be.visible');
    });
  });

  it('shows the subjects in the professors list and finds them by subject', () => {
    seed(uniqueAdmin()).then((ids) => {
      assignViaApi(ids, [
        [ids.english, ids.classA, ids.ana],
        [ids.language, ids.classA, ids.ana],
        [ids.english, ids.classB, ids.luis],
      ]);
      cy.visit('/profesores');

      cy.contains('tbody th[scope="row"]', 'García, Ana')
        .parent('tr')
        .should('contain', 'Inglés: 1º Primaria A · Lengua: 1º Primaria A');
      cy.contains('tbody th[scope="row"]', 'Pérez, Luis')
        .parent('tr')
        .should('contain', 'Inglés: 1º Primaria B');

      cy.get('#professor-search').type('lengua');
      cy.get('tbody tr').should('have.length', 1).and('contain', 'García, Ana');
      cy.get('#professor-search').clear();
      cy.get('#professor-search').type('ingles');
      cy.get('tbody tr').should('have.length', 2);
    });
  });

  it('drops the assignments of a class and of a subject that leave the course', () => {
    seed(uniqueAdmin()).then((ids) => {
      assignViaApi(ids, [
        [ids.english, ids.classA, ids.ana],
        [ids.language, ids.classA, ids.ana],
        [ids.english, ids.classB, ids.luis],
      ]);

      // Quitar la clase B del curso se lleva la asignación de Luis.
      callApi('PUT', `/api/courses/${ids.courseId}`, {
        name: '1º Primaria',
        classes: [{ id: ids.classA, name: 'A' }],
      });
      openFromCourses();
      cy.get(`select[aria-label*=" en B"]`).should('not.exist');
      cy.contains(missing(0, 2)).should('be.visible');
      cy.contains('Pérez, Luis 3 sesiones').should('not.exist');
      cy.contains('García, Ana 7 sesiones').should('be.visible');

      // «No se imparte» en la carga se lleva la de Lengua.
      callApi('PATCH', `/api/courses/${ids.courseId}/workload`, {
        changes: [
          { subjectId: ids.language, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
        ],
      });
      cy.reload();
      cy.wait('@getAssignments');
      cy.get(`select[aria-label*="Profesor de Lengua"]`).should('not.exist');
      cellSelect('Inglés', 'A').should('have.value', ids.ana);

      cy.visit('/profesores');
      cy.contains('tbody th[scope="row"]', 'García, Ana')
        .parent('tr')
        .should('contain', 'Inglés: 1º Primaria A')
        .and('not.contain', 'Lengua');
      cy.contains('tbody th[scope="row"]', 'Pérez, Luis')
        .parent('tr')
        .should('contain', es.professors.noSubjects);
    });
  });

  it('lets a member assign professors', () => {
    const admin = uniqueAdmin();
    seed(admin).then((ids) => {
      loginAsMember(admin);
      openFromCourses();

      cellSelect('Lengua', 'B').select(ids.luis);
      saveButton().should('be.enabled').click();
      cy.wait('@putAssignments').its('response.statusCode').should('equal', 200);
      cy.contains(texts.saved.replace('{{course}}', '1º Primaria')).should('be.visible');
      cy.contains(missing(3, 4)).should('be.visible');
    });
  });

  it('works on a 360 px screen, per class, without horizontal scrolling', () => {
    cy.viewport(360, 740);
    seed(uniqueAdmin()).then((ids) => {
      openFromCourses();
      expectNoHorizontalScroll();
      cy.get('table').should('not.exist');

      tutorButton('A').click();
      cellSelect('Inglés', 'A').should('have.value', ids.ana);
      cellSelect('Lengua', 'B').select(ids.luis);
      expectNoHorizontalScroll();
      saveButton().should('be.enabled').click();
      cy.wait('@putAssignments').its('response.statusCode').should('equal', 200);
      cy.contains(texts.saved.replace('{{course}}', '1º Primaria')).should('be.visible');
      expectNoHorizontalScroll();

      cy.visit('/profesores');
      cy.contains('h2', 'García, Ana').closest('li').should('contain', 'Inglés: 1º Primaria A');
      expectNoHorizontalScroll();
    });
  });
});

describe('Avisos de asignaciones que se pierden (US-PROF-ASSIGN_b)', () => {
  const dialog = () => cy.get('[role="dialog"]');
  const sessionsSelect = (subject: string) =>
    cy.get(`select[aria-label="${es.workload.matrix.select.replace('{{subject}}', subject)}"]`);

  /**
   * Inglés (con una regla de máximo al día) asignado a Ana en A y a Luis en B, y Lengua a Luis en B: Luis tiene dos
   * asignaciones y la clase B también.
   */
  function seedWithAssignments(admin: TestAdmin) {
    return seed(admin).then((ids) => {
      callApi('PATCH', `/api/courses/${ids.courseId}/workload`, {
        changes: [{ subjectId: ids.english, sessionsPerWeek: 3, maxPerDay: 2, blockSize: null }],
      });
      assignViaApi(ids, [
        [ids.english, ids.classA, ids.ana],
        [ids.english, ids.classB, ids.luis],
        [ids.language, ids.classB, ids.luis],
      ]);
      return cy.then(() => ids);
    });
  }

  beforeEach(() => {
    cy.intercept('GET', '/api/courses/*/assignments').as('getAssignments');
    cy.intercept('GET', '/api/courses/*/workload').as('getWorkload');
    cy.intercept('GET', '/api/professors/*').as('getProfessor');
    cy.intercept('DELETE', '/api/professors/*').as('deleteProfessor');
    cy.intercept('PUT', '/api/courses/*').as('putCourse');
  });

  it('warns in the workload of the rule and the assignments that stop being taught are lost, and only for the subject that changes', () => {
    seedWithAssignments(uniqueAdmin()).then((ids) => {
      cy.visit(`/cursos/${ids.courseId}/carga`);
      cy.wait('@getWorkload');
      cy.contains('Al guardar se borrar').should('not.exist');

      sessionsSelect('Inglés').select(es.workload.matrix.notTaught);
      cy.contains(
        'Al guardar se borrarán su regla y sus 2 asignaciones de profesores en este curso',
      ).should('be.visible');

      sessionsSelect('Lengua').select(es.workload.matrix.notTaught);
      cy.contains('Al guardar se borrará su asignación de profesor en este curso').should(
        'be.visible',
      );

      sessionsSelect('Inglés').select('3');
      cy.contains('su regla y sus 2 asignaciones').should('not.exist');
    });
  });

  it('asks before removing a class that has assignments and no students, and drops them on saving', () => {
    seedWithAssignments(uniqueAdmin()).then((ids) => {
      cy.visit(`/cursos/${ids.courseId}/editar`);
      cy.get('button[aria-label="Quitar la clase 1"]').should('be.visible');

      cy.get('button[aria-label="Quitar la clase 2"]').click();
      dialog().should('contain', '¿Quitar la clase B?');
      dialog().should(
        'contain',
        'Al guardar el curso se quitarán también sus 2 asignaciones de profesores.',
      );
      dialog().should('not.contain', 'alumno');

      cy.contains('[role="dialog"] button', es.courses.form.removeDialog.confirm).click();
      dialog().should('not.exist');
      cy.contains('button', es.courses.form.save).click();
      cy.wait('@putCourse').its('response.statusCode').should('equal', 200);

      cy.visit(`/cursos/${ids.courseId}/profesores`);
      cy.wait('@getAssignments');
      cy.get('select[aria-label*=" en B"]').should('not.exist');
      cellSelect('Inglés', 'A').should('have.value', ids.ana);
    });
  });

  it('lists the assignments of a professor before deleting them and leaves their cells unassigned afterwards', () => {
    seedWithAssignments(uniqueAdmin()).then((ids) => {
      cy.visit('/profesores');
      cy.get('button[aria-label="Borrar Pérez, Luis"]').click();
      cy.wait('@getProfessor');

      dialog().should(
        'contain',
        'Se quitarán también sus 2 asignaciones de profesores: Inglés: 1º Primaria B · Lengua: 1º Primaria B.',
      );
      // Ana, sin asignaciones de las que avisar aquí, solo ve el aviso de lo suyo (una).
      cy.contains('[role="dialog"] button', es.professors.delete.confirm).click();
      cy.wait('@deleteProfessor').its('response.statusCode').should('equal', 200);

      cy.visit(`/cursos/${ids.courseId}/profesores`);
      cy.wait('@getAssignments');
      cellSelect('Inglés', 'B').should('have.value', '');
      cellSelect('Lengua', 'B').should('have.value', '');
      cellSelect('Inglés', 'A').should('have.value', ids.ana);
    });
  });

  it('shows the notices and the dialogs on a 360 px screen without horizontal scrolling', () => {
    cy.viewport(360, 740);
    seedWithAssignments(uniqueAdmin()).then((ids) => {
      cy.visit(`/cursos/${ids.courseId}/carga`);
      cy.wait('@getWorkload');
      sessionsSelect('Inglés').select(es.workload.matrix.notTaught);
      cy.contains('su regla y sus 2 asignaciones de profesores').should('be.visible');
      expectNoHorizontalScroll();

      cy.visit(`/cursos/${ids.courseId}/editar`);
      cy.get('button[aria-label="Quitar la clase 2"]').click();
      dialog().should('contain', 'sus 2 asignaciones de profesores');
      expectNoHorizontalScroll();
      cy.contains('[role="dialog"] button', es.courses.form.removeDialog.cancel).click();

      cy.visit('/profesores');
      cy.get('button[aria-label="Borrar Pérez, Luis"]').click();
      cy.wait('@getProfessor');
      dialog().should('contain', 'Se quitarán también sus 2 asignaciones de profesores');
      expectNoHorizontalScroll();
    });
  });
});
