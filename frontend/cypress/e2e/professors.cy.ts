import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}p${sequence}`;
  return {
    schoolName: `Colegio Profesores ${id}`,
    email: `profesores.${id}@example.com`,
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

const form = es.professors.form;
const professorsLink = () =>
  cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.professors);
const firstNameField = () => cy.get('#professor-firstName');
const lastNameField = () => cy.get('#professor-lastName');
const positionField = () => cy.get('#professor-position');
const classField = () => cy.get('#professor-classId');
const saveButton = () => cy.contains('button', form.save);

/** Fila del profesor en la tabla del listado (desde 768 px). */
const professorRow = (name: string) => cy.contains('tbody th[scope="row"]', name).parent('tr');

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

interface ApiCourse {
  id: string;
  name: string;
  classes: { id: string; name: string }[];
}

/** Crea un curso por la API y da el curso creado. */
function createCourseViaApi(name: string, classNames: string[], use?: (course: ApiCourse) => void) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/courses',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { name, classes: classNames.map((className) => ({ name: className })) },
    }).then((response) => {
      expect(response.status).to.equal(201);
      use?.((response.body as { data: { course: ApiCourse } }).data.course);
    });
  });
}

/** Crea un profesor por la API con la sesión del navegador. */
function createProfessorViaApi(firstName: string, lastName: string, classId?: string) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/professors',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { firstName, lastName, ...(classId === undefined ? {} : { classId }) },
    })
      .its('status')
      .should('equal', 201);
  });
}

describe('professors', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/professors').as('createProfessor');
    cy.intercept('GET', '/api/professors').as('listProfessors');
    cy.intercept('GET', '/api/courses').as('listCourses');
  });

  it('lets an administrator create a professor with a class and see them in the list, in "Tutores" and in the edit row', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A', 'B']);
    cy.visit('/onboarding');

    professorsLink().click();

    cy.wait('@listProfessors').its('response.statusCode').should('equal', 200);
    cy.location('pathname').should('equal', '/profesores');
    cy.contains(es.professors.empty).should('be.visible');
    cy.contains('a', es.professors.create).click();
    cy.location('pathname').should('equal', '/profesores/nuevo');

    cy.wait('@listCourses');
    classField().should('be.enabled');
    classField().find('optgroup').should('have.length', 1).and('have.attr', 'label', '1º Primaria');
    classField().find('optgroup option').should('have.length', 2);
    firstNameField().type('Ana');
    lastNameField().type('García');
    positionField().select(es.professors.positions.DIRECTOR);
    classField().select('A');
    saveButton().click();

    cy.wait('@createProfessor').then(({ response }) => {
      expect(response?.statusCode).to.equal(201);
      const professor = (
        response?.body as {
          data: { professor: { subjects: unknown[]; tutoredClass: { name: string } } };
        }
      ).data.professor;
      expect(professor.subjects).to.deep.equal([]);
      expect(professor.tutoredClass.name).to.equal('A');
    });
    cy.location('pathname').should('equal', '/profesores');
    cy.contains('[role="status"]', es.professors.created.replace('{{name}}', 'Ana García')).should(
      'be.visible',
    );
    professorRow('García, Ana')
      .should('contain', es.professors.positions.DIRECTOR)
      .and('contain', '1º Primaria · A');

    cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.courses).click();
    cy.contains('tbody th[scope="row"]', '1º Primaria')
      .parent('tr')
      .find('td')
      .eq(1)
      .should('have.text', 'A: Ana García');
    cy.get('a[aria-label="Editar 1º Primaria"]').click();
    cy.contains('Tutor: Ana García').should('be.visible');
    cy.contains(es.courses.noTutor).should('be.visible');
    cy.contains('button', es.courses.form.save).should('be.disabled');

    cy.visit('/profesores/nuevo');
    cy.wait('@listCourses');
    classField().should('be.enabled');
    classField().find('optgroup option').should('have.length', 1).and('have.text', 'B');
  });

  it('validates before sending: shows the errors, focuses the first field and sends nothing', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/profesores/nuevo');
    firstNameField().should('be.visible');

    saveButton().click();

    cy.contains(form.errors.firstName.REQUIRED).should('be.visible');
    cy.contains(form.errors.lastName.REQUIRED).should('be.visible');
    firstNameField().should('have.focus').and('have.attr', 'aria-invalid', 'true');
    cy.get('@createProfessor.all').should('have.length', 0);
    cy.location('pathname').should('equal', '/profesores/nuevo');
  });

  it('shows the error in the class field, and keeps what was typed, when someone else gives that class a tutor first', () => {
    registerViaApi(uniqueAdmin());
    let classId = '';
    createCourseViaApi('1º Primaria', ['A', 'B'], (course) => {
      classId = course.classes.find((schoolClass) => schoolClass.name === 'A')?.id ?? '';
    });
    cy.visit('/profesores/nuevo');
    cy.wait('@listCourses');
    classField().should('be.enabled');
    firstNameField().type('Ana');
    lastNameField().type('García');
    classField().select('A');
    cy.then(() => {
      createProfessorViaApi('Luis', 'Ruiz', classId);
    });

    saveButton().click();

    cy.wait('@createProfessor').its('response.statusCode').should('equal', 409);
    cy.contains(form.errors.classId.alreadyHasTutor).should('be.visible');
    classField().should('have.focus').and('have.attr', 'aria-invalid', 'true');
    firstNameField().should('have.value', 'Ana');
    cy.location('pathname').should('equal', '/profesores/nuevo');
  });

  it('leaves the professor without a class when the course of their class is deleted', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A'], (course) => {
      createProfessorViaApi('Ana', 'García', course.classes[0]?.id);
    });
    cy.visit('/profesores');
    professorRow('García, Ana').should('contain', '1º Primaria · A');

    cy.visit('/cursos');
    cy.get('button[aria-label="Borrar 1º Primaria"]').click();
    cy.get('[role="dialog"]').contains('button', es.courses.delete.confirm).click();
    cy.contains(es.courses.empty).should('be.visible');

    cy.visit('/profesores');
    professorRow('García, Ana').should('contain', es.professors.noClass);
  });

  it('lets a member create a professor', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    const memberEmail = admin.email.replace('profesores.', 'miembro.');
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
    cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.users).should(
      'not.exist',
    );

    professorsLink().click();
    cy.contains('a', es.professors.create).click();
    firstNameField().type('Eva');
    lastNameField().type('Gil');
    saveButton().click();

    cy.wait('@createProfessor').its('response.statusCode').should('equal', 201);
    professorRow('Gil, Eva').should('contain', es.professors.noClass);
  });

  it('shows a table on a wide screen and cards on a 360 px screen, without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    createProfessorViaApi('Ana', 'García');
    createProfessorViaApi('Luis', 'Ruiz');
    cy.visit('/profesores');
    cy.get('table').should('be.visible');
    cy.get('main ul li').should('not.exist');

    cy.viewport(360, 740);
    cy.visit('/profesores');

    cy.get('table').should('not.exist');
    cy.get('main ul li').should('have.length', 2);
    cy.contains('main li h2', 'García, Ana').closest('li').should('contain', es.professors.noClass);
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
  });

  it('sends a visitor without a session to the login', () => {
    cy.visit('/profesores');

    cy.location('pathname').should('equal', '/login');
  });
});
