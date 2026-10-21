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

/** Da el id de un profesor ya creado, buscándolo por su nombre en el listado de la API. */
function withProfessorId(firstName: string, use: (professorId: string) => void) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'GET',
      url: '/api/professors',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((response) => {
      const professors = (
        response.body as { data: { professors: { id: string; firstName: string }[] } }
      ).data.professors;
      use(professors.find((professor) => professor.firstName === firstName)?.id ?? '');
    });
  });
}

/** Cambia por la API el tutor de una clase de un curso, como haría otra persona a la vez. */
function setTutorViaApi(course: ApiCourse, className: string, professorId: string) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'PUT',
      url: `/api/courses/${course.id}`,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        name: course.name,
        classes: course.classes.map((schoolClass) => ({
          id: schoolClass.id,
          name: schoolClass.name,
          ...(schoolClass.name === className && { tutorId: professorId }),
        })),
      },
    })
      .its('status')
      .should('equal', 200);
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
      .and('contain', 'Tutor de 1º Primaria A');

    cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.courses).click();
    cy.contains('tbody th[scope="row"]', '1º Primaria')
      .parent('tr')
      .find('td')
      .eq(1)
      .should('have.text', 'A: Ana García');
    cy.get('a[aria-label="Editar 1º Primaria"]').click();
    cy.wait('@listProfessors');
    cy.get('select[aria-label="Tutor de la clase 1"]')
      .find('option:selected')
      .should('have.text', 'Ana García · clase A');
    cy.get('select[aria-label="Tutor de la clase 2"]')
      .find('option:selected')
      .should('have.text', es.courses.form.noTutorOption);
    cy.contains('button', es.courses.form.save).should('be.disabled');

    cy.visit('/profesores/nuevo');
    cy.wait('@listCourses');
    classField().should('be.enabled');
    classField().find('optgroup option').should('have.length', 1).and('have.text', 'B');
  });

  describe('choosing the tutors from the course edition', () => {
    const tutorSelect = (number: number) =>
      cy.get(`select[aria-label="Tutor de la clase ${number}"]`);
    const saveCourse = () => cy.contains('button', es.courses.form.save);
    const tutorsCell = (courseName: string) =>
      cy.contains('tbody th[scope="row"]', courseName).parent('tr').find('td').eq(1);

    it('assigns a tutor to a class and shows it in "Tutores" and in the professors list', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B']);
      createProfessorViaApi('Ana', 'García');
      cy.visit('/cursos');
      cy.get('a[aria-label="Editar 1º Primaria"]').click();
      cy.wait('@listProfessors');

      tutorSelect(1).select('Ana García');
      saveCourse().click();

      cy.location('pathname').should('equal', '/cursos');
      tutorsCell('1º Primaria').should('have.text', 'A: Ana García');
      cy.visit('/profesores');
      professorRow('García, Ana').should('contain', 'Tutor de 1º Primaria A');
    });

    it('swaps the tutors of two classes in a single save', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B'], (course) => {
        createProfessorViaApi('Ana', 'García', course.classes.find((c) => c.name === 'A')?.id);
        createProfessorViaApi('Luis', 'Ruiz', course.classes.find((c) => c.name === 'B')?.id);
      });
      cy.visit('/cursos');
      cy.get('a[aria-label="Editar 1º Primaria"]').click();
      cy.wait('@listProfessors');

      tutorSelect(1).select('Luis Ruiz · clase B');
      tutorSelect(2).select('Ana García · clase A');
      saveCourse().click();

      cy.location('pathname').should('equal', '/cursos');
      tutorsCell('1º Primaria').should('have.text', 'A: Luis Ruiz, B: Ana García');
    });

    it('warns and marks the row when the professor becomes tutor of another course before saving', () => {
      registerViaApi(uniqueAdmin());
      let otherCourse: ApiCourse | undefined;
      createCourseViaApi('2º Primaria', ['C'], (course) => {
        otherCourse = course;
      });
      createCourseViaApi('1º Primaria', ['A', 'B']);
      createProfessorViaApi('Luis', 'Ruiz');
      cy.visit('/cursos');
      cy.get('a[aria-label="Editar 1º Primaria"]').click();
      cy.wait('@listProfessors');
      tutorSelect(2).select('Luis Ruiz');
      withProfessorId('Luis', (luisId) => {
        setTutorViaApi(otherCourse as ApiCourse, 'C', luisId);
      });

      saveCourse().click();

      cy.contains('[role="alert"]', es.courses.form.errors.professorAlreadyTutor).should(
        'be.visible',
      );
      cy.contains(es.courses.form.errors.tutorId.ALREADY_TUTOR).should('be.visible');
      tutorSelect(2).should('have.focus').and('have.attr', 'aria-invalid', 'true');
      cy.location('pathname').should('match', /\/cursos\/[^/]+\/editar$/);
    });

    it('shows the edition on a 360 px screen without horizontal scrolling', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B'], (course) => {
        createProfessorViaApi('Ana', 'García', course.classes.find((c) => c.name === 'A')?.id);
        createProfessorViaApi('Luis', 'Ruiz');
      });
      cy.viewport(360, 740);
      cy.visit('/cursos');
      cy.get('a[aria-label="Editar 1º Primaria"]').click();
      cy.wait('@listProfessors');

      tutorSelect(1).should('be.visible').find('option:selected').should('contain', 'Ana García');
      tutorSelect(2).should('be.visible');
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });
    });
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
    professorRow('García, Ana').should('contain', 'Tutor de 1º Primaria A');

    cy.visit('/cursos');
    cy.get('button[aria-label="Borrar 1º Primaria"]').click();
    cy.get('[role="dialog"]').contains('button', es.courses.delete.confirm).click();
    cy.contains(es.courses.empty).should('be.visible');

    cy.visit('/profesores');
    professorRow('García, Ana').should('contain', es.professors.noTutorship);
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
    professorRow('Gil, Eva').should('contain', es.professors.noTutorship);
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
    cy.contains('main li h2', 'García, Ana')
      .closest('li')
      .should('contain', es.professors.noTutorship);
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
  });

  describe('pagination of the list', () => {
    const LONG_LAST_NAME = `Larguisimo${'o'.repeat(80)}`;
    const pagination = es.professors.pagination;
    const noHorizontalScroll = () =>
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });

    /** 25 profesores por la API: el 07 es tutor de la clase A y el último, de apellido larguísimo, queda en la segunda página. */
    function create25Professors() {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A'], (course) => {
        const classId = course.classes[0]?.id;
        withAccessToken((accessToken) => {
          const professors = Array.from({ length: 24 }, (_, index) => {
            const label = String(index + 1).padStart(2, '0');
            return {
              firstName: `Nombre${label}`,
              lastName: `Apellido${label}`,
              ...(label === '07' && { classId }),
            };
          });
          for (const professor of [
            ...professors,
            { firstName: 'Pilar', lastName: LONG_LAST_NAME },
          ]) {
            cy.request({
              method: 'POST',
              url: '/api/professors',
              headers: { Authorization: `Bearer ${accessToken}` },
              body: professor,
            })
              .its('status')
              .should('equal', 201);
          }
        });
      });
    }

    it('shows the total, 20 per page and the tutorship, and goes through the pages with the keyboard focus on the buttons', () => {
      create25Professors();
      cy.visit('/profesores');

      cy.get('[data-testid="professors-count"]').should('have.text', '25 profesores');
      cy.get('tbody tr').should('have.length', 20);
      cy.contains('tbody tr', 'Apellido07, Nombre07').should('contain', 'Tutor de 1º Primaria A');
      cy.contains('tbody tr', 'Apellido01, Nombre01').should('contain', es.professors.noTutorship);
      cy.get(`nav[aria-label="${pagination}"]`).should('be.visible');
      cy.contains('Página 1 de 2').should('be.visible');
      cy.contains('button', es.pagination.previous).should('be.disabled');

      cy.contains('button', es.pagination.next).click();

      cy.get('tbody tr').should('have.length', 5);
      cy.contains('Página 2 de 2').should('be.visible');
      cy.contains('button', es.pagination.next).should('be.disabled');
      cy.contains('button', es.pagination.previous).should('have.focus');
      cy.contains('tbody th', 'Apellido24, Nombre24').should('exist');

      cy.contains('button', es.pagination.previous).click();

      cy.get('tbody tr').should('have.length', 20);
      cy.contains('Página 1 de 2').should('be.visible');
      cy.contains('button', es.pagination.next).should('have.focus');
    });

    it('shows 20 cards per page on a 360 px screen, with the pagination and a very long name, without horizontal scrolling', () => {
      create25Professors();
      cy.viewport(360, 740);
      cy.visit('/profesores');

      cy.get('main ul li').should('have.length', 20);
      cy.get(`nav[aria-label="${pagination}"]`).should('be.visible');
      noHorizontalScroll();

      cy.contains('button', es.pagination.next).click();

      cy.get('main ul li').should('have.length', 5);
      cy.contains('main li h2', LONG_LAST_NAME).should('be.visible');
      noHorizontalScroll();
    });

    it('shows no pagination with 20 professors or fewer', () => {
      registerViaApi(uniqueAdmin());
      createProfessorViaApi('Ana', 'García');
      cy.visit('/profesores');

      cy.get('[data-testid="professors-count"]').should('have.text', '1 profesor');
      cy.get(`nav[aria-label="${pagination}"]`).should('not.exist');
    });
  });

  describe('search of the list', () => {
    const search = es.professors.search;
    const searchField = () => cy.get('#professor-search');
    const noHorizontalScroll = () =>
      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });

    /** Crea varios profesores por la API con un solo token. */
    function createProfessorsViaApi(professors: { firstName: string; lastName: string }[]) {
      withAccessToken((accessToken) => {
        for (const professor of professors) {
          cy.request({
            method: 'POST',
            url: '/api/professors',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: professor,
          })
            .its('status')
            .should('equal', 201);
        }
      });
    }

    it('finds without accents and with several words in any order, says when nothing matches, and clears giving the focus back', () => {
      registerViaApi(uniqueAdmin());
      createProfessorsViaApi([
        { firstName: 'José María', lastName: 'García-López' },
        { firstName: 'Ana', lastName: 'García' },
        { firstName: 'Luis', lastName: 'Pérez' },
      ]);
      cy.visit('/profesores');
      cy.get('[data-testid="professors-count"]').should('have.text', '3 profesores');

      searchField().type('garcia jose');

      cy.get('tbody tr').should('have.length', 1).and('contain', 'García-López, José María');
      cy.get('[data-testid="professors-count"]')
        .should('have.attr', 'role', 'status')
        .and('have.text', 'Mostrando 1 de 3 profesores');

      searchField().clear();
      searchField().type('perez luis');
      cy.get('tbody tr').should('have.length', 1).and('contain', 'Pérez, Luis');

      searchField().clear();
      searchField().type('zzz');

      cy.get('tbody tr').should('not.exist');
      cy.get('[data-testid="professors-count"]').should(
        'have.text',
        search.noResults.replace('{{query}}', 'zzz'),
      );
      cy.contains('button', search.clear).click();

      cy.get('tbody tr').should('have.length', 3);
      searchField().should('have.value', '').and('have.focus');
      cy.get('[data-testid="professors-count"]').should('not.have.attr', 'role');
      cy.get('[data-testid="professors-count"]').should('have.text', '3 profesores');
    });

    it('goes back to the first page when the search changes while on the second one', () => {
      registerViaApi(uniqueAdmin());
      createProfessorsViaApi([
        ...Array.from({ length: 25 }, (_, index) => ({
          firstName: `Nombre${String(index + 1).padStart(2, '0')}`,
          lastName: 'Martín',
        })),
        ...Array.from({ length: 5 }, (_, index) => ({
          firstName: `Otro${String(index + 1)}`,
          lastName: 'Zapata',
        })),
      ]);
      cy.visit('/profesores');
      cy.contains('button', es.pagination.next).click();
      cy.contains('Página 2 de 2').should('be.visible');
      cy.get('tbody tr').should('have.length', 10);

      searchField().type('martin');

      cy.contains('Página 1 de 2').should('be.visible');
      cy.get('tbody tr').should('have.length', 20);
      cy.get('[data-testid="professors-count"]').should(
        'have.text',
        'Mostrando 25 de 30 profesores',
      );

      searchField().clear();
      searchField().type('zapata');

      cy.get('tbody tr').should('have.length', 5);
      cy.get(`nav[aria-label="${es.professors.pagination}"]`).should('not.exist');
    });

    it('shows the search on a 360 px screen without horizontal scrolling', () => {
      registerViaApi(uniqueAdmin());
      createProfessorsViaApi([
        { firstName: 'Ana', lastName: 'García' },
        { firstName: 'Luis', lastName: 'Pérez' },
      ]);
      cy.viewport(360, 740);
      cy.visit('/profesores');

      searchField().type('garcia');

      cy.get('main ul li').should('have.length', 1);
      noHorizontalScroll();
      searchField().clear();
      searchField().type('zzz');
      cy.get('main ul li').should('not.exist');
      cy.contains('button', search.clear).should('be.visible');
      noHorizontalScroll();
    });
  });

  it('sends a visitor without a session to the login', () => {
    cy.visit('/profesores');

    cy.location('pathname').should('equal', '/login');
  });
});
