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

/** Fila del curso en la tabla del listado (desde 768 px; la ventana por defecto de Cypress es más ancha). */
const courseRow = (name: string) => cy.contains('tbody th[scope="row"]', name).parent('tr');

/** La fecha de creación como la muestra el listado en castellano. */
const formattedDate = (iso: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(iso));

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

/** El curso con ese nombre, leído por la API con la sesión del navegador. */
function findCourseViaApi(name: string, use: (course: ApiCourse) => void) {
  withAccessToken((accessToken) => {
    cy.request({ url: '/api/courses', headers: { Authorization: `Bearer ${accessToken}` } }).then(
      (response) => {
        const courses = (response.body as { data: { courses: ApiCourse[] } }).data.courses;
        const course = courses.find((candidate) => candidate.name === name);
        expect(course, `curso «${name}»`).to.not.equal(undefined);
        if (course) {
          use(course);
        }
      },
    );
  });
}

/** Crea un curso por la API con la sesión del navegador (el `refresh` da el access token). */
function createCourseViaApi(name: string, classNames: string[]) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/courses',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { name, classes: classNames.map((className) => ({ name: className })) },
    })
      .its('status')
      .should('equal', 201);
  });
}

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
    cy.intercept('GET', '/api/courses/*').as('getCourse');
    cy.intercept('PUT', '/api/courses/*').as('updateCourse');
    cy.intercept('GET', '/api/professors').as('listProfessors');
    cy.intercept('GET', '/api/courses/*/impact').as('courseImpact');
    cy.intercept('DELETE', '/api/courses/*').as('deleteCourse');
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

    cy.wait('@createCourse').then(({ response }) => {
      expect(response?.statusCode).to.equal(201);
      const createdAt = (response?.body as { data: { course: { createdAt: string } } }).data.course
        .createdAt;
      cy.location('pathname').should('equal', '/cursos');
      cy.contains('Curso «1º Primaria» creado').should('be.visible');
      courseRow('1º Primaria').within(() => {
        cy.get('td').eq(0).should('have.text', '2 clases: A, B');
        cy.get('td').eq(1).should('have.text', es.courses.noTutor);
        cy.get('td').eq(2).should('have.text', formattedDate(createdAt));
      });
    });
  });

  it('accepts names with ordinal signs, accents and the letter ñ', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/cursos/nuevo');

    fillCourse('Infantil 3 años - 2º ESO/ñ', ['1ªA', 'Grupo Ñ']);
    cy.contains('button', form.save).click();

    cy.wait('@createCourse').its('response.statusCode').should('equal', 201);
    courseRow('Infantil 3 años - 2º ESO/ñ')
      .find('td')
      .eq(0)
      .should('have.text', '2 clases: 1ªA, Grupo Ñ');
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

    cy.get('tbody th[scope="row"]').then(($headings) => {
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
    courseRow('1º Primaria').should('be.visible');
  });

  it('shows each school only its own courses', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/cursos/nuevo');
    fillCourse('1º Primaria', ['A']);
    cy.contains('button', form.save).click();
    cy.wait('@createCourse').its('response.statusCode').should('equal', 201);
    courseRow('1º Primaria').should('be.visible');
    cy.clearCookies();

    registerViaApi(uniqueAdmin());
    cy.visit('/cursos');

    cy.wait('@listCourses');
    cy.contains(es.courses.empty).should('be.visible');
    cy.contains('tbody th[scope="row"]', '1º Primaria').should('not.exist');
  });

  it('shows a table with the five columns on a wide screen, with an edit link and a delete button per course and no actions of later stories', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A', 'B']);
    cy.viewport(1280, 800);

    cy.visit('/cursos');

    cy.get('table')
      .should('be.visible')
      .find('thead th')
      .then(($headers) => {
        expect([...$headers].map((header) => header.textContent)).to.deep.equal([
          es.courses.fields.course,
          es.courses.fields.classes,
          es.courses.fields.tutors,
          es.courses.fields.created,
          es.courses.fields.actions,
        ]);
      });
    courseRow('1º Primaria').should('be.visible');
    cy.get('a[aria-label="Editar 1º Primaria"]')
      .should('have.attr', 'href')
      .and('match', /\/cursos\/.+\/editar$/);
    // Los únicos botones de la página son los de borrar; no hay acciones de historias futuras.
    cy.get('main button').should('have.length', 1);
    cy.get('main button[aria-label="Borrar 1º Primaria"]').should('be.enabled');
    cy.contains(/horario|alumnos/i).should('not.exist');
  });

  it('shows one card per course and no table on a 360 px screen, without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A', 'B']);
    createCourseViaApi('Educación Infantil', ['A']);
    cy.viewport(360, 740);

    cy.visit('/cursos');

    cy.get('table').should('not.exist');
    cy.get('main ul li').should('have.length', 2);
    cy.contains('main li h2', '1º Primaria')
      .closest('li')
      .should('contain', '2 clases: A, B')
      .and('contain', es.courses.noTutor);
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
  });

  it('searches by name without regard to case or accents, shows the result count and the empty state, and clears', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A']);
    createCourseViaApi('Educación Infantil', ['A']);
    createCourseViaApi('ESO', ['A']);
    cy.visit('/cursos');
    cy.get('tbody th[scope="row"]').should('have.length', 3);

    cy.get('input[type="search"]').type('educacion');

    cy.get('tbody th[scope="row"]').should('have.length', 1);
    courseRow('Educación Infantil').should('be.visible');
    cy.contains('[role="status"]', 'Mostrando 1 de 3 cursos').should('be.visible');
    cy.get('@listCourses.all').should('have.length', 1);

    cy.get('input[type="search"]').clear();
    cy.get('input[type="search"]').type('XYZ');

    cy.contains('No hay cursos que coincidan con «XYZ»').should('be.visible');
    cy.get('table').should('not.exist');
    cy.contains('button', es.courses.search.clear).click();
    cy.get('input[type="search"]').should('have.value', '').and('have.focus');
    cy.get('tbody th[scope="row"]').should('have.length', 3);
    cy.get('@listCourses.all').should('have.length', 1);
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

    cy.visit('/cursos/0192f5a0-0000-7000-8000-0000000000d1/editar');
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

  describe('editing a course', () => {
    const edit = es.courses.edit;
    const saveButton = () => cy.contains('button', form.save);
    const removeClassButton = (number: number) =>
      cy.get(`button[aria-label="Quitar la clase ${String(number)}"]`);
    const editLink = (name: string) => cy.get(`a[aria-label="Editar ${name}"]`);

    it('lets an administrator rename the course and a class, add one and remove another, keeping the id of the existing ones', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B', 'C']);
      let idOfA = '';
      let idOfB = '';
      cy.visit('/cursos');
      cy.wait('@listCourses');

      editLink('1º Primaria').click();

      cy.wait('@getCourse').then(({ response }) => {
        const classes = (response?.body as { data: { course: ApiCourse } }).data.course.classes;
        idOfA = classes.find((schoolClass) => schoolClass.name === 'A')?.id ?? '';
        idOfB = classes.find((schoolClass) => schoolClass.name === 'B')?.id ?? '';
      });
      cy.wait('@listProfessors');
      cy.location('pathname').should('match', /^\/cursos\/[^/]+\/editar$/);
      cy.contains('h1', edit.title).should('be.visible');
      nameField().should('have.value', '1º Primaria');
      classField(0).should('have.value', 'A');
      classField(2).should('have.value', 'C');
      saveButton().should('be.disabled');

      nameField().type(' Tarde');
      saveButton().should('be.enabled');
      classField(0).clear();
      classField(0).type('Grupo A');
      removeClassButton(3).click();
      cy.contains('button', form.addClass).click();
      classField(2).type('D');
      saveButton().click();

      cy.wait('@updateCourse').then(({ request, response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(request.body).to.deep.equal({
          name: '1º Primaria Tarde',
          classes: [
            { id: idOfA, name: 'Grupo A', tutorId: null },
            { id: idOfB, name: 'B', tutorId: null },
            { name: 'D', tutorId: null },
          ],
        });
      });
      cy.location('pathname').should('equal', '/cursos');
      cy.contains('Curso «1º Primaria Tarde» actualizado').should('be.visible');
      courseRow('1º Primaria Tarde')
        .find('td')
        .eq(0)
        .should('have.text', '3 clases: B, D, Grupo A');
      cy.reload();
      courseRow('1º Primaria Tarde')
        .find('td')
        .eq(0)
        .should('have.text', '3 clases: B, D, Grupo A');
    });

    it('swaps the names of two classes and reuses the name of a removed one in a single save', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B', 'C']);
      cy.visit('/cursos');
      editLink('1º Primaria').click();
      cy.contains('h1', edit.title).should('be.visible');

      classField(0).clear();
      classField(0).type('B');
      classField(1).clear();
      classField(1).type('A');
      removeClassButton(3).click();
      cy.contains('button', form.addClass).click();
      classField(2).type('C');
      saveButton().click();

      cy.wait('@updateCourse').its('response.statusCode').should('equal', 200);
      courseRow('1º Primaria').find('td').eq(0).should('have.text', '3 clases: A, B, C');
    });

    it('goes back to the list with Cancel and sends nothing', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A']);
      cy.visit('/cursos');
      editLink('1º Primaria').click();
      nameField().type(' Tarde');

      cy.contains('a', form.cancel).click();

      cy.location('pathname').should('equal', '/cursos');
      courseRow('1º Primaria').should('be.visible');
      cy.contains('actualizado').should('not.exist');
      cy.get('@updateCourse.all').should('have.length', 0);
    });

    it('shows the error under the name when another course already has it, keeping what was typed', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('5º Primaria', ['A']);
      createCourseViaApi('6º Primaria', ['A']);
      cy.visit('/cursos');
      editLink('5º Primaria').click();
      cy.contains('h1', edit.title).should('be.visible');

      nameField().clear();
      nameField().type('  6º   PRIMARIA ');
      saveButton().click();

      cy.wait('@updateCourse').its('response.statusCode').should('equal', 409);
      cy.location('pathname').should('match', /\/editar$/);
      cy.contains(form.errors.alreadyExists).should('be.visible');
      nameField().should('have.attr', 'aria-invalid', 'true').and('have.focus');
      nameField().should('have.value', '  6º   PRIMARIA ');
    });

    it('asks to reload when another person removed a class meanwhile, and shows the saved version after reloading', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B']);
      cy.visit('/cursos');
      editLink('1º Primaria').click();
      classField(1).should('have.value', 'B');
      // Otra persona quita la clase B por la API mientras esta tiene el formulario abierto.
      findCourseViaApi('1º Primaria', (course) => {
        const idOfA = course.classes.find((schoolClass) => schoolClass.name === 'A')?.id;
        withAccessToken((accessToken) => {
          cy.request({
            method: 'PUT',
            url: `/api/courses/${course.id}`,
            headers: { Authorization: `Bearer ${accessToken}` },
            body: { name: 'Nombre ajeno', classes: [{ id: idOfA, name: 'A' }] },
          })
            .its('status')
            .should('equal', 200);
        });
      });

      classField(1).clear();
      classField(1).type('Grupo B');
      saveButton().click();

      cy.wait('@updateCourse').its('response.statusCode').should('equal', 409);
      cy.contains('[role="alert"]', edit.changed).should('be.visible');
      classField(1).should('have.value', 'Grupo B');
      cy.contains('button', edit.reload).click();
      nameField().should('have.value', 'Nombre ajeno');
      cy.get('fieldset input').should('have.length', 1);
      classField(0).should('have.value', 'A');
      cy.contains('[role="alert"]', edit.changed).should('not.exist');
      saveButton().should('be.disabled');
    });

    it('says that the course is not available for a missing course or an id that is not a UUID', () => {
      registerViaApi(uniqueAdmin());

      for (const path of [
        '/cursos/0192f5a0-0000-7000-8000-00000000ffff/editar',
        '/cursos/abc/editar',
      ]) {
        cy.visit(path);
        cy.contains(edit.notFound).should('be.visible');
        cy.contains('a', edit.backToCourses).should('have.attr', 'href', '/cursos');
        cy.get('#course-name').should('not.exist');
      }
    });

    it('does not let a course of another school be opened from its address', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A']);
      let courseId = '';
      findCourseViaApi('1º Primaria', (course) => {
        courseId = course.id;
      });
      cy.clearCookies();
      registerViaApi(uniqueAdmin());

      cy.then(() => cy.visit(`/cursos/${courseId}/editar`));

      cy.wait('@getCourse').its('response.statusCode').should('equal', 404);
      cy.contains(edit.notFound).should('be.visible');
    });

    it('lets a member edit a course', () => {
      const admin = uniqueAdmin();
      registerViaApi(admin);
      createCourseViaApi('1º Primaria', ['A']);
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

      coursesLink().click();
      editLink('1º Primaria').click();
      nameField().type(' del miembro');
      saveButton().click();

      cy.wait('@updateCourse').its('response.statusCode').should('equal', 200);
      cy.contains('Curso «1º Primaria del miembro» actualizado').should('be.visible');
      courseRow('1º Primaria del miembro').should('be.visible');
    });

    it('does not scroll horizontally on a 360 px screen, with the edit link on the cards, with errors and with six classes', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('Educación Infantil de tres años', ['A', 'B', 'C', 'D', 'E', 'F']);
      cy.viewport(360, 740);
      cy.visit('/cursos');
      cy.get('table').should('not.exist');
      editLink('Educación Infantil de tres años').should('be.visible').click();
      cy.contains('h1', edit.title).should('be.visible');
      nameField().clear();
      saveButton().click();
      cy.contains(form.errors.name.REQUIRED).should('be.visible');

      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });
    });
  });

  describe('deleting a course', () => {
    const texts = es.courses.delete;
    const deleteButton = (name: string) => cy.get(`button[aria-label="Borrar ${name}"]`);
    const dialog = () => cy.get('[role="dialog"]');
    const confirmButton = () => cy.contains('[role="dialog"] button', texts.confirm);

    it('lets an administrator delete a course with its classes from the dialog, which says how many classes go', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B', 'C']);
      createCourseViaApi('2º Primaria', ['A']);
      cy.visit('/cursos');
      courseRow('1º Primaria').should('be.visible');

      deleteButton('1º Primaria').click();

      cy.wait('@courseImpact').its('response.statusCode').should('equal', 200);
      dialog().should('contain', '¿Borrar «1º Primaria»?');
      dialog().should('contain', 'Se borrarán sus 3 clases.').and('contain', texts.warning);
      cy.contains('[role="dialog"] button', texts.cancel).should('have.focus');
      confirmButton().click();

      cy.wait('@deleteCourse').then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body).to.deep.equal({
          success: true,
          data: { deleted: { classCount: 3, studentCount: 0 } },
        });
      });
      dialog().should('not.exist');
      cy.contains('Curso «1º Primaria» eliminado').should('be.visible');
      cy.contains('tbody th[scope="row"]', '1º Primaria').should('not.exist');
      courseRow('2º Primaria').should('be.visible');
      cy.get('h1').should('have.focus');
      cy.get('@listCourses.all').should('have.length', 1);

      cy.reload();
      cy.wait('@listCourses');
      courseRow('2º Primaria').should('be.visible');
      cy.contains('tbody th[scope="row"]', '1º Primaria').should('not.exist');
    });

    it('deletes nothing with Cancel or Escape and returns the focus to the button', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B']);
      cy.visit('/cursos');
      courseRow('1º Primaria').should('be.visible');

      deleteButton('1º Primaria').click();
      cy.wait('@courseImpact');
      cy.contains('[role="dialog"] button', texts.cancel).click();

      dialog().should('not.exist');
      courseRow('1º Primaria').should('be.visible');
      deleteButton('1º Primaria').should('have.focus');

      deleteButton('1º Primaria').click();
      cy.wait('@courseImpact');
      dialog().should('contain', 'Se borrarán sus 2 clases.');
      cy.get('body').type('{esc}');

      dialog().should('not.exist');
      courseRow('1º Primaria').should('be.visible');
      cy.get('@deleteCourse.all').should('have.length', 0);
    });

    it('says that the course no longer exists when someone else deleted it before confirming', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A']);
      createCourseViaApi('2º Primaria', ['A']);
      cy.visit('/cursos');
      courseRow('1º Primaria').should('be.visible');
      deleteButton('1º Primaria').click();
      cy.wait('@courseImpact');
      dialog().should('contain', 'Se borrará su clase.');
      // Otra persona borra el curso por la API mientras el diálogo está abierto.
      findCourseViaApi('1º Primaria', (course) => {
        withAccessToken((accessToken) => {
          cy.request({
            method: 'DELETE',
            url: `/api/courses/${course.id}`,
            headers: { Authorization: `Bearer ${accessToken}` },
          })
            .its('status')
            .should('equal', 200);
        });
      });

      confirmButton().click();

      cy.wait('@deleteCourse').its('response.statusCode').should('equal', 404);
      dialog().should('not.exist');
      cy.contains(texts.gone).should('be.visible');
      cy.contains('tbody th[scope="row"]', '1º Primaria').should('not.exist');
      courseRow('2º Primaria').should('be.visible');
    });

    it('shows the empty state, without a search box, when the last course is deleted', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B']);
      cy.visit('/cursos');
      deleteButton('1º Primaria').click();
      cy.wait('@courseImpact');

      confirmButton().click();

      cy.wait('@deleteCourse').its('response.statusCode').should('equal', 200);
      cy.contains(es.courses.empty).should('be.visible');
      cy.contains('a', es.courses.create).should('be.visible');
      cy.get('input[type="search"]').should('not.exist');
      cy.contains('Curso «1º Primaria» eliminado').should('be.visible');
    });

    it('lets a member delete a course', () => {
      const admin = uniqueAdmin();
      registerViaApi(admin);
      createCourseViaApi('1º Primaria', ['A']);
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

      coursesLink().click();
      deleteButton('1º Primaria').click();
      cy.wait('@courseImpact');
      confirmButton().click();

      cy.wait('@deleteCourse').its('response.statusCode').should('equal', 200);
      cy.contains('Curso «1º Primaria» eliminado').should('be.visible');
    });

    it('does not scroll horizontally on a 360 px screen, with the delete button on the cards and the dialog open', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('Educación Infantil de tres años', ['A', 'B', 'C', 'D', 'E', 'F']);
      cy.viewport(360, 740);
      cy.visit('/cursos');
      cy.get('table').should('not.exist');

      deleteButton('Educación Infantil de tres años').should('be.visible').click();

      cy.wait('@courseImpact');
      dialog().should('contain', 'Se borrarán sus 6 clases.');
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });
    });
  });
});
