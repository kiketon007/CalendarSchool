import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}s${sequence}`;
  return {
    schoolName: `Colegio Alumnos ${id}`,
    email: `alumnos.${id}@example.com`,
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

const form = es.students.form;
const firstNameField = () => cy.get('#student-firstName');
const lastNameField = () => cy.get('#student-lastName');
const courseField = () => cy.get('#student-courseId');
const classField = () => cy.get('#student-classId');
const saveButton = () => cy.contains('button', form.save);
const studentsLink = () =>
  cy.contains('[aria-label="' + es.header.navigation + '"] a', es.header.students);

/** Fila del alumno en la tabla del listado (desde 768 px). */
const studentRow = (name: string) => cy.contains('tbody th[scope="row"]', name).parent('tr');

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

/** Borra un curso por la API, como haría otra persona a la vez. */
function deleteCourseViaApi(courseId: string) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'DELETE',
      url: `/api/courses/${courseId}`,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .its('status')
      .should('equal', 200);
  });
}

interface NewStudentBody {
  firstName: string;
  lastName: string;
  courseId: string;
  classId?: string;
  cafeteria: boolean;
  scholarship?: boolean;
}

/** Crea un alumno por la API con la sesión del navegador. */
function createStudentViaApi(body: NewStudentBody) {
  withAccessToken((accessToken) => {
    cy.request({
      method: 'POST',
      url: '/api/students',
      headers: { Authorization: `Bearer ${accessToken}` },
      body,
    })
      .its('status')
      .should('equal', 201);
  });
}

describe('students', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/students').as('createStudent');
    cy.intercept('GET', '/api/students').as('listStudents');
    cy.intercept('GET', '/api/courses').as('listCourses');
  });

  const noHorizontalScroll = () =>
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });

  it('lets an administrator create a student with class, cafeteria and scholarship and see them in the list', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A', 'B']);
    cy.visit('/alumnos');
    cy.contains(es.students.empty).should('be.visible');

    cy.contains('a', es.students.create).click();
    cy.wait('@listCourses');
    firstNameField().type('Juan');
    lastNameField().type('García');
    courseField().should('be.enabled');
    courseField().select('1º Primaria');
    classField().select('A');
    cy.contains('label', es.students.form.cafeteriaYes).click();
    cy.contains('label', form.scholarship).click();
    cy.get('#student-foodType').type('Vegetariana');
    cy.get('#student-observations').type('Necesita apoyo');
    saveButton().click();

    cy.wait('@createStudent').its('response.statusCode').should('equal', 201);
    cy.location('pathname').should('equal', '/alumnos');
    cy.contains('[role="status"]', 'Alumno «Juan García» creado').should('be.visible');
    studentRow('García, Juan').should('contain', '1º Primaria A').and('contain', 'Sí · Con beca');
    cy.contains('Vegetariana').should('not.exist');
    cy.contains('Necesita apoyo').should('not.exist');
  });

  it('creates a student without class and without cafeteria, and shows the course without class', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A']);
    cy.visit('/alumnos/nuevo');
    cy.wait('@listCourses');

    firstNameField().type('Ana');
    lastNameField().type('Álvarez');
    courseField().should('be.enabled');
    courseField().select('1º Primaria');
    cy.contains('label', /^No$/).click();
    cy.get('#student-foodType').should('not.exist');
    saveButton().click();

    cy.wait('@createStudent').its('response.statusCode').should('equal', 201);
    studentRow('Álvarez, Ana').should('contain', '1º Primaria · Sin clase').and('contain', 'No');
  });

  it('offers only the classes of the chosen course', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A', 'B']);
    createCourseViaApi('2º Primaria', ['C']);
    cy.visit('/alumnos/nuevo');
    cy.wait('@listCourses');
    classField().should('be.disabled');

    courseField().should('be.enabled');
    courseField().select('1º Primaria');
    classField().find('option').should('have.length', 3);
    classField().select('B');
    courseField().select('2º Primaria');

    classField().should('have.value', '');
    classField().find('option').should('have.length', 2);
    classField().find('option').last().should('have.text', 'C');
  });

  it('validates before sending: shows the errors, focuses the first field and sends nothing', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A']);
    cy.visit('/alumnos/nuevo');
    cy.wait('@listCourses');
    courseField().should('be.enabled');

    saveButton().click();

    cy.contains(form.errors.firstName.REQUIRED).should('be.visible');
    cy.contains(form.errors.lastName.REQUIRED).should('be.visible');
    cy.contains(form.errors.courseId.REQUIRED).should('be.visible');
    cy.contains(form.errors.cafeteria.REQUIRED).should('be.visible');
    firstNameField().should('have.focus');
    cy.get('@createStudent.all').should('have.length', 0);
  });

  it('marks the course when someone else deletes it before saving, and keeps what was typed', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('1º Primaria', ['A'], (course) => {
      createCourseViaApi('2º Primaria', ['A']);
      cy.visit('/alumnos/nuevo');
      cy.wait('@listCourses');
      firstNameField().type('Juan');
      lastNameField().type('García');
      courseField().should('be.enabled');
      courseField().select('1º Primaria');
      cy.contains('label', /^No$/).click();
      deleteCourseViaApi(course.id);

      saveButton().click();

      cy.wait('@createStudent').its('response.statusCode').should('equal', 400);
      cy.contains(form.errors.courseId.NOT_FOUND).should('be.visible');
      courseField().should('have.focus');
      firstNameField().should('have.value', 'Juan');
      courseField().find('option').should('have.length', 2);
    });
  });

  it('lets a member create a student', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createCourseViaApi('1º Primaria', ['A']);
    const memberEmail = admin.email.replace('alumnos.', 'miembro.');
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

    studentsLink().click();
    cy.contains('a', es.students.create).click();
    cy.wait('@listCourses');
    firstNameField().type('Eva');
    lastNameField().type('Gil');
    courseField().should('be.enabled');
    courseField().select('1º Primaria');
    cy.contains('label', /^No$/).click();
    saveButton().click();

    cy.wait('@createStudent').its('response.statusCode').should('equal', 201);
    studentRow('Gil, Eva').should('contain', '1º Primaria');
  });

  it('shows the list as cards and the form on a 360 px screen, without horizontal scrolling', () => {
    registerViaApi(uniqueAdmin());
    createCourseViaApi('Educación Infantil de tres años', ['A']);
    cy.viewport(360, 740);
    cy.visit('/alumnos/nuevo');
    cy.wait('@listCourses');
    firstNameField().type('Juan');
    lastNameField().type('García de la Fuente y Fernández de Córdoba');
    courseField().should('be.enabled');
    courseField().select('Educación Infantil de tres años');
    cy.contains('label', es.students.form.cafeteriaYes).click();
    cy.get('#student-observations').type('Una observación bastante larga '.repeat(8));
    noHorizontalScroll();
    saveButton().click();

    cy.wait('@createStudent').its('response.statusCode').should('equal', 201);
    cy.get('table').should('not.exist');
    cy.contains('main li h2', 'García de la Fuente').should('be.visible');
    noHorizontalScroll();
  });

  describe('search, filters and pagination (US15)', () => {
    const filters = es.students.filters;
    const searchBox = () => cy.get('#student-search');
    const courseFilter = () => cy.get('#student-filter-course');
    const classFilter = () => cy.get('#student-filter-class');
    const cafeteriaFilter = () => cy.get('#student-filter-cafeteria');
    const scholarshipFilter = () => cy.get('#student-filter-scholarship');
    const count = () => cy.get('[data-testid="students-count"]');
    const shownRows = () => cy.get('tbody th[scope="row"]');
    const search = () => cy.location('search');

    /** 1º Primaria (A y B) y 2º Primaria (A) con cinco alumnos de distintos comedores y clases. */
    function populate() {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A', 'B'], (first) => {
        createCourseViaApi('2º Primaria', ['A'], (second) => {
          const [classA, classB] = first.classes;
          createStudentViaApi({
            firstName: 'Juan',
            lastName: 'García López',
            courseId: first.id,
            classId: classA?.id ?? '',
            cafeteria: true,
            scholarship: true,
          });
          createStudentViaApi({
            firstName: 'Ana',
            lastName: 'García',
            courseId: first.id,
            cafeteria: true,
            scholarship: false,
          });
          createStudentViaApi({
            firstName: 'José',
            lastName: 'Muñoz',
            courseId: first.id,
            classId: classB?.id ?? '',
            cafeteria: false,
          });
          createStudentViaApi({
            firstName: 'Luis',
            lastName: 'Pérez',
            courseId: second.id,
            classId: second.classes[0]?.id ?? '',
            cafeteria: false,
          });
          createStudentViaApi({
            firstName: 'Eva',
            lastName: 'Gil',
            courseId: second.id,
            cafeteria: true,
            scholarship: true,
          });
        });
      });
    }

    it('shows the total and finds students by words of the name, without accents, without writing the text in the URL', () => {
      populate();
      cy.visit('/alumnos');
      count().should('have.text', '5 alumnos');

      searchBox().type('juan garcia');
      shownRows().should('have.length', 1).and('have.text', 'García López, Juan');
      count().should('contain', 'Mostrando 1 de 5 alumnos');
      search().should('equal', '');

      searchBox().clear();
      searchBox().type('JOSE munoz');
      shownRows().should('have.length', 1).and('have.text', 'Muñoz, José');
      search().should('equal', '');
    });

    it('filters by course and class, with "Sin clase", and puts them in the URL', () => {
      populate();
      cy.visit('/alumnos');
      classFilter().should('be.disabled');

      courseFilter().select('1º Primaria');
      shownRows().should('have.length', 3);
      search().should('match', /^\?curso=[^&]+$/);
      classFilter().should('be.enabled').select('A');
      shownRows().should('have.length', 1).and('have.text', 'García López, Juan');
      search().should('match', /curso=.+&clase=.+/);
      classFilter().select(es.students.form.classNone);
      shownRows().should('have.length', 1).and('have.text', 'García, Ana');

      courseFilter().select('2º Primaria');
      classFilter().should('have.value', '');
      shownRows().should('have.length', 2);
    });

    it('filters by cafeteria and by scholarship, which only works with the cafeteria', () => {
      populate();
      cy.visit('/alumnos');
      scholarshipFilter().should('be.disabled');

      cafeteriaFilter().select(filters.cafeteriaYes);
      shownRows().should('have.length', 3);
      scholarshipFilter().should('be.enabled').select(filters.scholarshipYes);
      shownRows().should('have.length', 2);
      scholarshipFilter().select(filters.scholarshipNo);
      shownRows().should('have.length', 1).and('have.text', 'García, Ana');
      search().should('equal', '?comedor=si&beca=no');

      cafeteriaFilter().select(filters.cafeteriaNo);
      scholarshipFilter().should('be.disabled').and('have.value', 'all');
      shownRows().should('have.length', 2);
    });

    it('says when nothing matches and clears the search and the filters, leaving the focus on the search', () => {
      populate();
      cy.visit('/alumnos?curso=zzz');
      courseFilter().select('1º Primaria');
      searchBox().type('zzzzz');

      count().should('contain', filters.noResults);
      cy.get('table').should('not.exist');
      cy.contains('button', filters.clear).click();

      searchBox().should('have.value', '').and('have.focus');
      courseFilter().should('have.value', '');
      shownRows().should('have.length', 5);
      count().should('have.text', '5 alumnos');
      search().should('equal', '');
    });

    it('paginates more than 20 students and keeps the page and the filters when the page is reloaded', () => {
      registerViaApi(uniqueAdmin());
      createCourseViaApi('1º Primaria', ['A'], (course) => {
        for (let index = 1; index <= 23; index += 1) {
          const label = String(index).padStart(2, '0');
          createStudentViaApi({
            firstName: `Nombre${label}`,
            lastName: `Apellido${label}`,
            courseId: course.id,
            cafeteria: index % 2 === 0,
            ...(index % 2 === 0 && { scholarship: false }),
          });
        }
      });
      cy.visit('/alumnos');
      count().should('have.text', '23 alumnos');
      shownRows().should('have.length', 20);
      cy.contains('Página 1 de 2').should('be.visible');

      cy.contains('button', es.pagination.next).click();
      shownRows().should('have.length', 3);
      cy.contains('Página 2 de 2').should('be.visible');
      search().should('equal', '?pagina=2');

      cy.reload();
      shownRows().should('have.length', 3);
      cy.contains('Página 2 de 2').should('be.visible');

      cafeteriaFilter().select(filters.cafeteriaYes);
      search().should('equal', '?comedor=si');
      shownRows().should('have.length', 11);
      cy.reload();
      cafeteriaFilter().should('have.value', 'yes');
      shownRows().should('have.length', 11);
    });

    it('ignores a course that does not exist in the URL and does not scroll horizontally with the filters on a 360 px screen', () => {
      populate();
      cy.viewport(360, 740);
      cy.visit('/alumnos?curso=00000000-0000-7000-8000-000000000000&pagina=99');

      cy.get('main li h2').should('have.length', 5);
      courseFilter().should('have.value', '');
      cafeteriaFilter().select(filters.cafeteriaYes);
      cy.get('main li h2').should('have.length', 3);
      noHorizontalScroll();
    });
  });

  it('sends a visitor without a session to the login', () => {
    cy.visit('/alumnos');

    cy.location('pathname').should('equal', '/login');
  });
});
