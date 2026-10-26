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

/** Crea una asignatura por la API (por defecto, troncal, activa, azul y 2 sesiones por curso). */
function createSubjectViaApi(subject: ApiSubject) {
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
      .find('button')
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
