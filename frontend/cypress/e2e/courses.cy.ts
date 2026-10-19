import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}c${sequence}`;
  return {
    schoolName: `Colegio Cursos ${id}`,
    email: `cursos.${id}@example.com`,
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

const form = es.courses.form;
const coursesLink = () =>
  cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.courses);
const nameField = () => cy.get('#course-name');
const classField = (position: number) => cy.get('fieldset input').eq(position);

/** Rellena el formulario de `/cursos/nuevo`: el nombre y una fila por clase. */
function fillCourse(name: string, classNames: string[]) {
  nameField().clear();
  nameField().type(name);
  classNames.forEach((className, position) => {
    if (position > 0) {
      cy.contains('button', form.addClass).click();
    }
    classField(position).type(className);
  });
}

describe('courses', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/courses').as('createCourse');
    cy.intercept('GET', '/api/courses').as('listCourses');
  });

  it('lets an administrator create a course with two classes from the navigation and see it in the list', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    cy.visit('/onboarding');

    coursesLink().click();

    cy.wait('@listCourses').its('response.statusCode').should('equal', 200);
    cy.location('pathname').should('equal', '/cursos');
    cy.contains(es.courses.empty).should('be.visible');
    cy.contains('a', es.courses.create).click();
    cy.location('pathname').should('equal', '/cursos/nuevo');

    fillCourse('1º Primaria', ['A', 'B']);
    cy.contains('button', form.save).click();

    cy.wait('@createCourse').its('response.statusCode').should('equal', 201);
    cy.location('pathname').should('equal', '/cursos');
    cy.contains('Curso «1º Primaria» creado').should('be.visible');
    cy.contains('h2', '1º Primaria').should('be.visible');
    cy.get('ul[aria-label="Clases de 1º Primaria"] li').then(($items) => {
      expect([...$items].map((item) => item.textContent)).to.deep.equal([
        `A — ${es.courses.noTutor}`,
        `B — ${es.courses.noTutor}`,
      ]);
    });
  });

  it('accepts names with ordinal signs, accents and the letter ñ', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/cursos/nuevo');

    fillCourse('Infantil 3 años - 2º ESO/ñ', ['1ªA', 'Grupo Ñ']);
    cy.contains('button', form.save).click();

    cy.wait('@createCourse').its('response.statusCode').should('equal', 201);
    cy.contains('h2', 'Infantil 3 años - 2º ESO/ñ').should('be.visible');
    cy.contains('li', `1ªA — ${es.courses.noTutor}`).should('be.visible');
    cy.contains('li', `Grupo Ñ — ${es.courses.noTutor}`).should('be.visible');
  });

  it('lists the courses in natural order: 2º before 10º', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/cursos/nuevo');
    for (const name of ['10º Curso', '2º Primaria']) {
      fillCourse(name, ['A']);
      cy.contains('button', form.save).click();
      cy.wait('@createCourse').its('response.statusCode').should('equal', 201);
      cy.contains('a', es.courses.create).click();
    }

    cy.visit('/cursos');

    cy.get('main h2').then(($headings) => {
      expect([...$headings].map((heading) => heading.textContent)).to.deep.equal([
        '2º Primaria',
        '10º Curso',
      ]);
    });
  });

  it('shows the error under the name when the course already exists, keeping what was typed', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/cursos/nuevo');
    fillCourse('1º Primaria', ['A']);
    cy.contains('button', form.save).click();
    cy.wait('@createCourse').its('response.statusCode').should('equal', 201);
    cy.contains('a', es.courses.create).click();

    fillCourse('  1º   PRIMARIA ', ['A', 'B']);
    cy.contains('button', form.save).click();

    cy.wait('@createCourse').its('response.statusCode').should('equal', 409);
    cy.location('pathname').should('equal', '/cursos/nuevo');
    cy.contains(form.errors.alreadyExists).should('be.visible');
    nameField().should('have.attr', 'aria-invalid', 'true').and('have.value', '  1º   PRIMARIA ');
    classField(1).should('have.value', 'B');
  });

  it('validates in the browser and sends nothing when a field is wrong', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/cursos/nuevo');

    cy.contains('button', form.save).click();

    cy.contains(form.errors.name.REQUIRED).should('be.visible');
    cy.contains(form.errors.className.REQUIRED).should('be.visible');
    nameField().should('have.focus');

    fillCourse('1º Primaria', ['A', ' a ']);
    cy.contains('button', form.save).click();

    cy.contains(form.errors.className.DUPLICATE).should('be.visible');
    classField(1).should('have.attr', 'aria-invalid', 'true');
    cy.get('@createCourse.all').should('have.length', 0);
  });

  it('limits the form to 12 classes', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/cursos/nuevo');

    for (let count = 1; count < 12; count += 1) {
      cy.contains('button', form.addClass).click();
    }

    cy.get('fieldset input').should('have.length', 12);
    cy.contains('button', form.addClass).should('be.disabled');
  });

  it('lets a member see "Cursos" but not "Usuarios" in the navigation, and create a course', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    const memberEmail = admin.email.replace('cursos.', 'miembro.');
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
    coursesLink().should('be.visible');
    cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.users).should(
      'not.exist',
    );
    coursesLink().click();
    cy.contains('a', es.courses.create).click();
    fillCourse('1º Primaria', ['A']);
    cy.contains('button', form.save).click();
    cy.wait('@createCourse').its('response.statusCode').should('equal', 201);
    cy.contains('h2', '1º Primaria').should('be.visible');
  });

  it('shows each school only its own courses', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/cursos/nuevo');
    fillCourse('1º Primaria', ['A']);
    cy.contains('button', form.save).click();
    cy.wait('@createCourse').its('response.statusCode').should('equal', 201);
    cy.contains('h2', '1º Primaria').should('be.visible');
    cy.clearCookies();

    registerViaApi(uniqueAdmin());
    cy.visit('/cursos');

    cy.wait('@listCourses');
    cy.contains(es.courses.empty).should('be.visible');
    cy.contains('h2', '1º Primaria').should('not.exist');
  });

  it('keeps the welcome card "Gestión de horarios" as coming soon', () => {
    registerViaApi(uniqueAdmin());

    cy.visit('/onboarding');

    cy.contains('article', es.onboarding.features.schedules.name)
      .should('contain', es.onboarding.comingSoon)
      .find('a, button')
      .should('not.exist');
  });

  it('sends a visitor without a session to the login page', () => {
    cy.visit('/cursos');
    cy.location('pathname').should('equal', '/login');

    cy.visit('/cursos/nuevo');
    cy.location('pathname').should('equal', '/login');
  });

  it('does not scroll horizontally on a 360 px screen, with errors and with a course of six classes', () => {
    registerViaApi(uniqueAdmin());
    cy.viewport(360, 740);
    cy.visit('/cursos/nuevo');
    cy.contains('button', form.save).click();
    cy.contains(form.errors.name.REQUIRED).should('be.visible');

    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });

    fillCourse('Educación Infantil de tres años', ['A', 'B', 'C', 'D', 'E', 'F']);
    cy.contains('button', form.save).click();
    cy.wait('@createCourse').its('response.statusCode').should('equal', 201);
    cy.contains('h2', 'Educación Infantil de tres años').should('be.visible');
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
  });
});
