import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}s${sequence}`;
  return {
    schoolName: `Colegio Asignaturas ${id}`,
    email: `asignaturas.${id}@example.com`,
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

const form = es.subjects.form;
const subjectsLink = () =>
  cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.subjects);
const nameField = () => cy.get('#subject-name');
const codeField = () => cy.get('#subject-code');
const saveButton = () => cy.contains('button', form.save);

/** Casilla de un curso del formulario, por el texto exacto de su etiqueta. */
const courseCheckbox = (name: string) =>
  cy.contains('label', new RegExp(`^${name}$`)).closest('.form-check');
const sessionsSelect = (course: string) =>
  cy.get(`[aria-label="${form.courses.sessions.replace('{{course}}', course)}"]`);

/** Tarjeta de la asignatura en el listado. */
const subjectCard = (name: string) =>
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

interface ApiSubject {
  name: string;
  code?: string | null;
  type?: 'CORE' | 'ELECTIVE' | 'CUSTOM';
  status?: 'ACTIVE' | 'INACTIVE';
  color?: string;
  courseIds?: string[];
}

/**
 * Crea una asignatura por la API (por defecto, troncal, activa, azul y 2 sesiones por curso) y da su id.
 */
function createSubjectViaApi(subject: ApiSubject, use?: (subjectId: string) => void) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/subjects',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        name: subject.name,
        code: subject.code ?? null,
        type: subject.type ?? 'CORE',
        status: subject.status ?? 'ACTIVE',
        color: subject.color ?? 'blue',
        courses: (subject.courseIds ?? []).map((courseId) => ({ courseId, sessionsPerWeek: 2 })),
      },
    }).then((response) => {
      expect(response.status).to.equal(201);
      use?.((response.body as { data: { subject: { id: string } } }).data.subject.id);
    });
  });
}

/** Borra una asignatura por la API, como lo haría otra persona mientras esta la tiene abierta. */
function deleteSubjectViaApi(subjectId: string) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'DELETE',
      url: `/api/subjects/${subjectId}`,
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((response) => {
      expect(response.status).to.equal(200);
    });
  });
}

/** Entra con una cuenta `MEMBER` del colegio del administrador (la aplicación aún no la crea sola). */
function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('asignaturas.', 'miembro.');
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

describe('Asignaturas', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/subjects').as('listSubjects');
  });

  it('creates English in every course and Programming in one, and shows them with their courses', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria');
    createCourseViaApi('2º Primaria');
    createCourseViaApi('10º Primaria');
    cy.visit('/onboarding');

    subjectsLink().click();
    cy.wait('@listSubjects');
    cy.contains(es.subjects.empty).should('be.visible');
    cy.contains('a', es.subjects.create).click();
    cy.location('pathname').should('equal', '/asignaturas/nueva');

    nameField().type('Inglés');
    codeField().type('ING');
    cy.get('#subject-type').select('CORE');
    cy.get('#subject-description').type('Lengua extranjera');
    cy.get('#subject-color-teal').check();
    courseCheckbox('1º Primaria').find('input').check();
    courseCheckbox('2º Primaria').find('input').check();
    courseCheckbox('10º Primaria').find('input').check();
    sessionsSelect('1º Primaria').should('have.value', '2');
    sessionsSelect('10º Primaria').select('4');
    saveButton().click();

    cy.location('pathname').should('equal', '/asignaturas');
    cy.contains('[role="status"]', 'Asignatura «Inglés» creada').should('be.visible');
    subjectCard('Inglés')
      .should('contain', 'Código ING')
      .and('contain', 'Troncal')
      .and('contain', 'Activa')
      .and('contain', 'Lengua extranjera')
      .and('contain', '3 cursos · 8 sesiones a la semana')
      .find('[role="img"][aria-label="Color: Verde azulado"]')
      .should('be.visible');
    subjectCard('Inglés').contains('button', '3 cursos').click();
    subjectCard('Inglés')
      .should('contain', '1º Primaria: 2 sesiones')
      .and('contain', '2º Primaria: 2 sesiones')
      .and('contain', '10º Primaria: 4 sesiones');

    cy.contains('a', es.subjects.create).click();
    nameField().type('Programación');
    cy.get('#subject-type').select('CUSTOM');
    courseCheckbox('2º Primaria').find('input').check();
    sessionsSelect('2º Primaria').select('3');
    saveButton().click();

    cy.location('pathname').should('equal', '/asignaturas');
    subjectCard('Programación')
      .should('contain', 'Propia del centro')
      .and('contain', '1 curso · 3 sesiones a la semana')
      .and('not.contain', 'Código');
    cy.get('article h2').then(($titles) => {
      expect([...$titles].map((title) => title.textContent)).to.deep.equal([
        'Inglés',
        'Programación',
      ]);
    });
  });

  it('asks for what is missing and puts the focus on the first field that is not valid', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria');
    cy.visit('/asignaturas/nueva');

    saveButton().click();

    cy.contains(es.subjects.form.errors.name.REQUIRED).should('be.visible');
    cy.contains(es.subjects.form.errors.type.REQUIRED).should('be.visible');
    cy.contains(es.subjects.form.errors.courses.REQUIRED).should('be.visible');
    cy.focused().should('have.attr', 'id', 'subject-name');
    cy.location('pathname').should('equal', '/asignaturas/nueva');

    nameField().type('Inglés');
    codeField().type('IN G');
    cy.get('#subject-type').select('CORE');
    courseCheckbox('1º Primaria').find('input').check();
    saveButton().click();

    cy.contains(es.subjects.form.errors.code.INVALID_CHARACTERS).should('be.visible');
    cy.focused().should('have.attr', 'id', 'subject-code');
  });

  it('filters and searches the list in the browser, with every filter combined', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', code: 'ING', courseIds: [courseId] });
      createSubjectViaApi({ name: 'Programación', type: 'CUSTOM', courseIds: [courseId] });
      createSubjectViaApi({
        name: 'Francés',
        code: 'FR-2',
        type: 'ELECTIVE',
        status: 'INACTIVE',
        courseIds: [courseId],
      });
    });
    cy.visit('/asignaturas');
    cy.wait('@listSubjects');
    const titles = () =>
      cy.get('article h2').then(($titles) => [...$titles].map((title) => title.textContent));

    cy.get('article').should('have.length', 3);

    cy.get('#subjects-filter-type').select('CORE');
    cy.get('article h2').should('have.length', 1).and('contain', 'Inglés');

    cy.get('#subjects-filter-type').select(es.subjects.filters.all);
    cy.get('#subjects-filter-status').select('INACTIVE');
    cy.get('article h2').should('have.length', 1).and('contain', 'Francés');

    cy.get('#subjects-filter-status').select(es.subjects.filters.all);
    cy.get('#subjects-search').type('prog');
    cy.get('article h2').should('have.length', 1).and('contain', 'Programación');

    cy.get('#subjects-search').clear();
    cy.get('#subjects-search').type('fr-2');
    cy.get('article h2').should('have.length', 1).and('contain', 'Francés');

    cy.get('#subjects-search').clear();
    cy.get('#subjects-filter-type').select('CORE');
    cy.get('#subjects-filter-status').select('INACTIVE');
    cy.contains('[role="status"]', es.subjects.noMatches).should('be.visible');
    cy.get('article').should('have.length', 0);

    cy.get('#subjects-filter-type').select(es.subjects.filters.all);
    cy.get('#subjects-filter-status').select(es.subjects.filters.all);
    titles().should('deep.equal', ['Francés', 'Inglés', 'Programación']);
    // Todo se hizo en el navegador: la lista se pidió una sola vez.
    cy.get('@listSubjects.all').should('have.length', 1);
  });

  it('shows an error under the name and under the code when they are already used', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', code: 'ING', courseIds: [courseId] });
    });
    cy.visit('/asignaturas/nueva');

    nameField().type('  inglés ');
    cy.get('#subject-type').select('CORE');
    courseCheckbox('1º Primaria').find('input').check();
    saveButton().click();

    cy.contains(es.subjects.form.errors.alreadyExists).should('be.visible');
    cy.focused().should('have.attr', 'id', 'subject-name');
    nameField().should('have.value', '  inglés ');
    courseCheckbox('1º Primaria').find('input').should('be.checked');

    nameField().clear();
    nameField().type('Inglés 2');
    codeField().type('ing');
    saveButton().click();

    cy.contains(es.subjects.form.errors.codeAlreadyExists).should('be.visible');
    cy.focused().should('have.attr', 'id', 'subject-code');
    cy.location('pathname').should('equal', '/asignaturas/nueva');
  });

  it('keeps a subject, without courses, when its only course is deleted', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', courseIds: [courseId] });
      withAccessToken((accessToken) => {
        cy.request({
          method: 'DELETE',
          url: `/api/courses/${courseId}`,
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .its('status')
          .should('equal', 200);
      });
    });
    cy.visit('/asignaturas');

    subjectCard('Inglés')
      .should('contain', es.subjects.list.noCourses)
      .and('contain', es.subjects.list.noCoursesHint)
      .find('button[aria-expanded]')
      .should('not.exist');
  });

  it('lets a member see the subjects but not create them, and sends them away from the form', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', courseIds: [courseId] });
    });
    loginAsMember(admin);

    subjectsLink().click();
    cy.wait('@listSubjects');

    subjectCard('Inglés').should('be.visible');
    cy.contains(es.subjects.readOnly).should('be.visible');
    cy.contains('a', es.subjects.create).should('not.exist');

    cy.visit('/asignaturas/nueva');

    cy.location('pathname').should('equal', '/onboarding');
  });

  it('fits the form and the list on a 360 px screen without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({
        name: 'Educación Física y Salud con un nombre muy largo para ver cómo se parte',
        code: 'EF-SALUD',
        courseIds: [courseId],
      });
    });
    cy.viewport(360, 740);

    cy.visit('/asignaturas/nueva');
    nameField().should('be.visible');
    cy.get('#subject-color-gray').should('exist');
    courseCheckbox('1º Primaria').find('input').check();
    sessionsSelect('1º Primaria').should('be.visible');
    expectNoHorizontalScroll();

    cy.visit('/asignaturas');
    cy.get('article').should('have.length', 1);
    cy.contains('article button', '1 curso').click();
    cy.contains('1º Primaria: 2 sesiones').should('be.visible');
    expectNoHorizontalScroll();
  });
});

describe('Asignaturas: edición', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/subjects').as('listSubjects');
  });

  const editLink = (name: string) =>
    cy.get(`a[aria-label="${es.subjects.editAria.replace('{{name}}', name)}"]`);
  const statusSelect = () => cy.get('#subject-status');
  const editedNotice = (name: string) => es.subjects.updated.replace('{{name}}', name);

  /** Abre la edición de la asignatura desde el listado y espera a que el formulario esté cargado. */
  function openEdition(name: string) {
    cy.visit('/asignaturas');
    cy.wait('@listSubjects');
    editLink(name).click();
    cy.location('pathname').should('match', /^\/asignaturas\/[0-9a-f-]{36}\/editar$/u);
    nameField().should('be.visible');
  }

  it('opens with Save disabled, renames, and shows the notice and the new name in the list', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', code: 'ING', courseIds: [courseId] });
    });

    openEdition('Inglés');

    nameField().should('have.value', 'Inglés');
    codeField().should('have.value', 'ING');
    saveButton().should('be.disabled');
    nameField().type(' ');
    saveButton().should('be.disabled');
    nameField().clear();
    nameField().type('Inglés avanzado');
    saveButton().should('be.enabled').click();

    cy.location('pathname').should('equal', '/asignaturas');
    cy.contains('[role="status"]', editedNotice('Inglés avanzado')).should('be.visible');
    subjectCard('Inglés avanzado').should('contain', 'Código ING');
    cy.get('article').should('have.length', 1);
  });

  it('inactivates a subject from the form and finds it with the "Inactiva" filter', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', courseIds: [courseId] });
      createSubjectViaApi({ name: 'Programación', courseIds: [courseId] });
    });

    openEdition('Inglés');
    statusSelect().select('INACTIVE');
    saveButton().click();

    cy.location('pathname').should('equal', '/asignaturas');
    cy.get('#subjects-filter-status').select('INACTIVE');
    cy.get('article h2').should('have.length', 1).and('contain', 'Inglés');
    subjectCard('Inglés').should('contain', 'Inactiva');
    cy.get('#subjects-filter-status').select('ACTIVE');
    cy.get('article h2').should('have.length', 1).and('contain', 'Programación');
  });

  it('changes the sessions of a course, adds one and removes another, and gives back the sessions a course had when it is ticked again', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (first) => {
      createCourseViaApi('2º Primaria', (second) => {
        createCourseViaApi('10º Primaria');
        createSubjectViaApi({ name: 'Inglés', courseIds: [first, second] });
      });
    });

    openEdition('Inglés');
    courseCheckbox('1º Primaria').find('input').should('be.checked');
    courseCheckbox('2º Primaria').find('input').should('be.checked');
    courseCheckbox('10º Primaria').find('input').should('not.be.checked');

    // Desmarcar y volver a marcar recupera las sesiones con las que se abrió, no las de antes de desmarcar.
    sessionsSelect('2º Primaria').select('5');
    saveButton().should('be.enabled');
    courseCheckbox('2º Primaria').find('input').uncheck();
    courseCheckbox('2º Primaria').find('input').check();
    sessionsSelect('2º Primaria').should('have.value', '2');
    saveButton().should('be.disabled');

    sessionsSelect('1º Primaria').select('4');
    courseCheckbox('2º Primaria').find('input').uncheck();
    courseCheckbox('10º Primaria').find('input').check();
    sessionsSelect('10º Primaria').should('have.value', '2');
    saveButton().should('be.enabled').click();

    cy.location('pathname').should('equal', '/asignaturas');
    subjectCard('Inglés').should('contain', '2 cursos · 6 sesiones a la semana');
    subjectCard('Inglés').contains('button', '2 cursos').click();
    subjectCard('Inglés')
      .should('contain', '1º Primaria: 4 sesiones')
      .and('contain', '10º Primaria: 2 sesiones')
      .and('not.contain', '2º Primaria');
  });

  it('shows an error under the name and under the code of another subject', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', code: 'ING', courseIds: [courseId] });
      createSubjectViaApi({ name: 'Programación', code: 'PRG', courseIds: [courseId] });
    });

    openEdition('Programación');
    nameField().clear();
    nameField().type('  inglés ');
    saveButton().click();

    cy.contains(es.subjects.form.errors.alreadyExists).should('be.visible');
    cy.focused().should('have.attr', 'id', 'subject-name');
    nameField().should('have.value', '  inglés ');

    nameField().clear();
    nameField().type('Programación');
    codeField().clear();
    codeField().type('ing');
    saveButton().click();

    cy.contains(es.subjects.form.errors.codeAlreadyExists).should('be.visible');
    cy.focused().should('have.attr', 'id', 'subject-code');
    cy.location('pathname').should('match', /\/editar$/u);
    // Cambiar solo las mayúsculas del propio código sí vale.
    codeField().clear();
    codeField().type('prg');
    saveButton().click();
    cy.location('pathname').should('equal', '/asignaturas');
    subjectCard('Programación').should('contain', 'Código prg');
  });

  it('asks to tick a course for a subject that lost all of them, and saves it once one is ticked', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (lost) => {
      createCourseViaApi('2º Primaria');
      createSubjectViaApi({ name: 'Inglés', courseIds: [lost] }, () => {
        withAccessToken((accessToken) => {
          cy.request({
            method: 'DELETE',
            url: `/api/courses/${lost}`,
            headers: { Authorization: `Bearer ${accessToken}` },
          })
            .its('status')
            .should('equal', 200);
        });
      });
    });

    openEdition('Inglés');
    cy.contains(es.subjects.form.courses.emptySubject).should('be.visible');
    nameField().type(' 2');
    saveButton().click();

    cy.contains(es.subjects.form.errors.courses.REQUIRED).should('be.visible');
    cy.focused().should('have.attr', 'id', 'subject-course-0');
    cy.location('pathname').should('match', /\/editar$/u);

    courseCheckbox('2º Primaria').find('input').check();
    cy.contains(es.subjects.form.courses.emptySubject).should('not.exist');
    saveButton().click();

    cy.location('pathname').should('equal', '/asignaturas');
    subjectCard('Inglés 2').should('contain', '1 curso · 2 sesiones a la semana');
  });

  it('says that the subject does not exist for an id that is not there, with a link to the list', () => {
    registerViaApi(uniqueAdmin());

    cy.visit('/asignaturas/0192f5a0-0000-7000-8000-00000000ffff/editar');
    cy.contains(es.subjects.form.notFound).should('be.visible');
    cy.contains('a', es.subjects.form.backToList).should('have.attr', 'href', '/asignaturas');
    nameField().should('not.exist');

    cy.visit('/asignaturas/no-es-un-uuid/editar');
    cy.contains(es.subjects.form.notFound).should('be.visible');
  });

  it('says that the subject does not exist when it is gone while it is being edited', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', courseIds: [courseId] }, (subjectId) => {
        cy.intercept('PUT', '/api/subjects/*').as('updateSubject');

        openEdition('Inglés');
        nameField().should('have.value', 'Inglés');
        // Otra persona la borra mientras esta la tiene abierta: el guardado recibe un 404 real.
        deleteSubjectViaApi(subjectId);
        nameField().type(' 2');
        saveButton().click();
      });
    });

    cy.wait('@updateSubject').its('response.statusCode').should('equal', 404);
    cy.contains(es.subjects.form.notFound).should('be.visible');
    cy.contains('a', es.subjects.form.backToList).click();
    cy.location('pathname').should('equal', '/asignaturas');
  });

  it('lets a member see the subjects without a way to edit them, and sends them away from the edition', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', courseIds: [courseId] }, (subjectId) => {
        cy.wrap(subjectId).as('subjectId');
      });
    });
    loginAsMember(admin);

    subjectsLink().click();
    cy.wait('@listSubjects');

    subjectCard('Inglés').should('be.visible');
    cy.get('a[aria-label^="Editar"]').should('not.exist');
    cy.get<string>('@subjectId').then((subjectId) => {
      cy.visit(`/asignaturas/${subjectId}/editar`);
    });

    cy.location('pathname').should('equal', '/onboarding');
  });

  it('fits the edition on a 360 px screen without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({
        name: 'Educación Física y Salud con un nombre muy largo para ver cómo se parte',
        code: 'EF-SALUD',
        courseIds: [courseId],
      });
    });
    cy.viewport(360, 740);

    openEdition('Educación Física y Salud con un nombre muy largo para ver cómo se parte');
    sessionsSelect('1º Primaria').should('be.visible');
    cy.get('#subject-color-gray').should('exist');
    expectNoHorizontalScroll();
  });
});

describe('Asignaturas: borrado', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/subjects').as('listSubjects');
  });

  const deleteTexts = es.subjects.delete;
  const deleteButton = (name: string) =>
    cy.get(`button[aria-label="${es.subjects.deleteLabel.replace('{{name}}', name)}"]`);
  const dialog = () => cy.get('[role="dialog"]');
  const confirmDelete = () => dialog().contains('button', deleteTexts.confirm);
  const cancelDelete = () => dialog().contains('button', deleteTexts.cancel);
  const deletedNotice = (name: string) => deleteTexts.deleted.replace('{{name}}', name);

  /** Abre el listado de asignaturas y espera a que haya cargado. */
  function openList() {
    cy.visit('/asignaturas');
    cy.wait('@listSubjects');
  }

  it('shows the courses and the reminder, focuses Cancel, and gives the focus back to "Borrar" when cancelling', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (firstCourse) => {
      createCourseViaApi('2º Primaria', (secondCourse) => {
        createSubjectViaApi({ name: 'Inglés', courseIds: [firstCourse, secondCourse] });
      });
    });
    openList();

    deleteButton('Inglés').click();

    dialog().should('be.visible').and('contain', '¿Borrar la asignatura «Inglés»?');
    dialog().should('contain', 'Se imparte en: 1º Primaria, 2º Primaria');
    dialog().should('contain', deleteTexts.inactivateHint).and('contain', deleteTexts.warning);
    dialog().find('a').should('not.exist');
    cancelDelete().should('have.focus');

    cancelDelete().click();

    dialog().should('not.exist');
    deleteButton('Inglés').should('have.focus');
    subjectCard('Inglés').should('be.visible');
  });

  it('deletes a subject with courses, focuses the title, keeps the courses and frees the name and the code', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', code: 'ING', courseIds: [courseId] });
      createSubjectViaApi({ name: 'Música', color: 'orange', courseIds: [courseId] });
    });
    openList();

    deleteButton('Inglés').click();
    confirmDelete().click();

    cy.contains('[role="status"]', deletedNotice('Inglés')).should('be.visible');
    cy.contains('article h2', 'Inglés').should('not.exist');
    subjectCard('Música').should('be.visible');
    cy.get('h1').should('have.focus');

    cy.visit('/cursos');
    cy.contains('1º Primaria').should('be.visible');

    cy.visit('/asignaturas/nueva');
    nameField().type('Inglés');
    codeField().type('ing');
    cy.get('#subject-type').select('CORE');
    courseCheckbox('1º Primaria').find('input').check();
    saveButton().click();
    cy.location('pathname').should('equal', '/asignaturas');
    cy.wait('@listSubjects');
    subjectCard('Inglés').should('contain', 'ing');
  });

  it('deletes a subject that is taught in no course', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', courseIds: [courseId] });
      createSubjectViaApi({ name: 'Música', color: 'orange', courseIds: [courseId] });
      withAccessToken((accessToken) => {
        cy.request({
          method: 'DELETE',
          url: `/api/courses/${courseId}`,
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .its('status')
          .should('equal', 200);
      });
    });
    openList();

    deleteButton('Inglés').click();

    dialog().should('contain', deleteTexts.noCourses).and('not.contain', 'Se imparte en:');
    confirmDelete().click();

    cy.contains('[role="status"]', deletedNotice('Inglés')).should('be.visible');
    cy.contains('article h2', 'Inglés').should('not.exist');
    subjectCard('Música').should('be.visible');
  });

  it('says that nothing matches when the only visible subject is deleted with a filter on, and shows the empty state with the last one', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', courseIds: [courseId] });
      createSubjectViaApi({ name: 'Música', color: 'orange', courseIds: [courseId] });
    });
    openList();
    cy.get('#subjects-search').type('ingl');
    cy.get('article').should('have.length', 1);

    deleteButton('Inglés').click();
    confirmDelete().click();

    cy.contains('[role="status"]', deletedNotice('Inglés')).should('be.visible');
    cy.contains(es.subjects.noMatches).should('be.visible');
    cy.get('#subjects-search').should('have.value', 'ingl');

    cy.get('#subjects-search').clear();
    deleteButton('Música').click();
    confirmDelete().click();

    cy.contains('[role="status"]', deletedNotice('Música')).should('be.visible');
    cy.contains(es.subjects.empty).should('be.visible');
    cy.get('article').should('not.exist');
  });

  it('says that the subject no longer exists when someone else deleted it first, and reloads the list', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', courseIds: [courseId] }, (subjectId) => {
        createSubjectViaApi({ name: 'Música', color: 'orange', courseIds: [courseId] });
        openList();
        deleteSubjectViaApi(subjectId);
        deleteButton('Inglés').click();
        confirmDelete().click();
      });
    });

    cy.contains('[role="status"]', deleteTexts.gone).should('be.visible');
    cy.contains('article h2', 'Inglés').should('not.exist');
    subjectCard('Música').should('be.visible');
  });

  it('lets a member see the subjects without a way to delete them', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({ name: 'Inglés', courseIds: [courseId] });
    });
    loginAsMember(admin);

    subjectsLink().click();
    cy.wait('@listSubjects');

    subjectCard('Inglés').should('be.visible');
    cy.get('button[aria-label^="Borrar"]').should('not.exist');
  });

  it('fits the confirmation on a 360 px screen without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', (courseId) => {
      createSubjectViaApi({
        name: 'Educación Física y Salud con un nombre muy largo para ver cómo se parte',
        code: 'EF-SALUD',
        courseIds: [courseId],
      });
    });
    cy.viewport(360, 740);
    openList();

    deleteButton('Educación Física y Salud con un nombre muy largo para ver cómo se parte').click();

    dialog().should('be.visible');
    cancelDelete().should('be.visible');
    confirmDelete().should('be.visible');
    expectNoHorizontalScroll();
  });
});
