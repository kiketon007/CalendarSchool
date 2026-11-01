import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}r${sequence}`;
  return {
    schoolName: `Colegio Resumen ${id}`,
    email: `resumen.${id}@example.com`,
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

const texts = es.professors.summary;

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

type Period = { type: 'SESSION' | 'BREAK'; startTime: string; endTime: string };
const session = (startTime: string, endTime: string): Period => ({
  type: 'SESSION',
  startTime,
  endTime,
});

/** Tres sesiones de 60 min, un recreo y dos de 45: 15 de 60 y 10 de 45 a la semana. */
const MIXED: Period[] = [
  session('09:00', '10:00'),
  session('10:00', '11:00'),
  session('11:00', '12:00'),
  { type: 'BREAK', startTime: '12:00', endTime: '12:30' },
  session('12:30', '13:15'),
  session('13:15', '14:00'),
];
/** Tres sesiones de 60 min y dos de 90: 15 de 60 y 10 de 90 a la semana. */
const LONG: Period[] = [
  session('09:00', '10:00'),
  session('10:00', '11:00'),
  session('11:00', '12:00'),
  session('12:30', '14:00'),
  session('14:00', '15:30'),
];

interface Seed {
  admin: TestAdmin;
  ana: string;
  firstCourse: string;
}

interface CreatedCourse {
  id: string;
  classA: string;
  classB: string;
}

/**
 * Un colegio con tres cursos de dos clases: 1º Primaria («Mixto»), 3º Primaria («Largo») y 6º Primaria, sin calendario.
 * Cuatro profesores: Ana García (10 sesiones en 1º, sin poder de lunes a jueves: no le alcanza la disponibilidad), Eva
 * Pérez (3 en 1º y 3 en 6º, que no cuentan), Pedro Soto (20 en 3º: puede pasar de 23 h) y Luis Ruiz (sin carga). Faltan
 * profesores en 1º (1 celda), 3º (4) y 6º (1).
 */
function seed(admin: TestAdmin): Cypress.Chainable<Seed> {
  const ids = { admin } as Seed;
  const courses: Record<string, CreatedCourse> = {};
  const subjects: Record<string, string> = {};
  const professors: Record<string, string> = {};
  registerViaApi(admin);

  const createCourse = (name: string) => {
    callApi('POST', '/api/courses', { name, classes: [{ name: 'A' }, { name: 'B' }] }, (body) => {
      const course = (body as { data: { course: { id: string; classes: { id: string }[] } } }).data
        .course;
      courses[name] = {
        id: course.id,
        classA: course.classes[0]?.id ?? '',
        classB: course.classes[1]?.id ?? '',
      };
    });
  };
  createCourse('1º Primaria');
  createCourse('3º Primaria');
  createCourse('6º Primaria');

  cy.then(() => {
    callApi('POST', '/api/calendars', {
      name: 'Mixto',
      periods: MIXED,
      courseIds: [courses['1º Primaria']?.id],
    });
    callApi('POST', '/api/calendars', {
      name: 'Largo',
      periods: LONG,
      courseIds: [courses['3º Primaria']?.id],
    });
    const subject = (name: string, course: string, sessions: number) => {
      callApi(
        'POST',
        '/api/subjects',
        {
          name,
          type: 'CORE',
          status: 'ACTIVE',
          color: 'blue',
          courses: [{ courseId: courses[course]?.id, sessionsPerWeek: sessions }],
        },
        (body) => {
          subjects[name] = (body as { data: { subject: { id: string } } }).data.subject.id;
        },
      );
    };
    subject('Lengua', '1º Primaria', 5);
    subject('Inglés', '1º Primaria', 3);
    subject('Mates 1', '3º Primaria', 5);
    subject('Mates 2', '3º Primaria', 5);
    subject('Mates 3', '3º Primaria', 5);
    subject('Mates 4', '3º Primaria', 5);
    subject('Lengua 6', '6º Primaria', 3);
    for (const [firstName, lastName] of [
      ['Ana', 'García'],
      ['Eva', 'Pérez'],
      ['Pedro', 'Soto'],
      ['Luis', 'Ruiz'],
    ] as const) {
      callApi('POST', '/api/professors', { firstName, lastName }, (body) => {
        professors[firstName] = (body as { data: { professor: { id: string } } }).data.professor.id;
      });
    }
  });

  cy.then(() => {
    const cell = (
      course: string,
      className: 'classA' | 'classB',
      subject: string,
      who: string,
    ) => ({
      subjectId: subjects[subject],
      classId: courses[course]?.[className],
      professorId: professors[who],
    });
    callApi('PUT', `/api/courses/${courses['1º Primaria']?.id}/assignments`, {
      assignments: [
        cell('1º Primaria', 'classA', 'Lengua', 'Ana'),
        cell('1º Primaria', 'classB', 'Lengua', 'Ana'),
        cell('1º Primaria', 'classA', 'Inglés', 'Eva'),
      ],
    });
    callApi('PUT', `/api/courses/${courses['3º Primaria']?.id}/assignments`, {
      assignments: ['Mates 1', 'Mates 2', 'Mates 3', 'Mates 4'].map((name) =>
        cell('3º Primaria', 'classA', name, 'Pedro'),
      ),
    });
    callApi('PUT', `/api/courses/${courses['6º Primaria']?.id}/assignments`, {
      assignments: [cell('6º Primaria', 'classA', 'Lengua 6', 'Eva')],
    });
    // Ana no puede de lunes a jueves: le quedan 5 sesiones libres para 10.
    callApi('PUT', `/api/professors/${professors['Ana']}/availability`, {
      unavailable: [1, 2, 3, 4].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: '09:00',
        endTime: '14:00',
      })),
    });
  });

  return cy.then(() => {
    ids.ana = professors['Ana'] ?? '';
    ids.firstCourse = courses['1º Primaria']?.id ?? '';
    return ids;
  });
}

/** Entra con una cuenta `MEMBER` del colegio del administrador (la aplicación aún no la crea sola). */
function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('resumen.', 'miembro.');
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

/** Abre el resumen desde «Profesores» y espera a que cargue. */
function openFromProfessors() {
  cy.visit('/profesores');
  cy.contains('a', es.professors.summaryLink).click();
  cy.wait('@getSummary');
  cy.location('pathname').should('equal', '/profesores/resumen');
  cy.contains('h1', texts.title).should('be.visible');
}

const rowOf = (name: string) => cy.contains('tbody tr', name);
const count = () => cy.get('[data-testid="professors-summary-count"]');

describe('Resumen de carga de los profesores', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/professors/summary').as('getSummary');
  });

  it('opens from "Professors" and shows the states, the ranges, the warnings and the courses without professor', () => {
    seed(uniqueAdmin()).then(() => {
      openFromProfessors();

      // Orden por apellidos: García, Pérez, Ruiz y Soto.
      cy.get('tbody tr').should('have.length', 4);
      count().should('have.text', '4 profesores');

      // Ana: 10 sesiones en «Mixto», de 10 × 45 a 10 × 60 minutos.
      rowOf('García, Ana').within(() => {
        cy.contains('7 h 30 min – 10 h').should('be.visible');
        cy.contains(texts.statuses.FITS).should('be.visible');
        cy.contains('En «Mixto» tiene 10 sesiones y solo puede dar 5').should('be.visible');
      });
      // Eva: 3 sesiones en «Mixto»; las 3 de 6º, sin calendario, no suman.
      rowOf('Pérez, Eva').within(() => {
        cy.contains('2 h 15 min – 3 h').should('be.visible');
        cy.contains('1 asignación en 6º Primaria, que no tiene calendario, no se cuenta').should(
          'be.visible',
        );
      });
      rowOf('Ruiz, Luis').within(() => {
        cy.contains(texts.statuses.NO_LOAD).should('be.visible');
        cy.contains(texts.noHours).should('be.visible');
      });
      // Pedro: 20 sesiones en «Largo», de 1350 a 1500 minutos.
      rowOf('Soto, Pedro').within(() => {
        cy.contains('22 h 30 min – 25 h').should('be.visible');
        cy.contains(texts.statuses.MAY_EXCEED).should('be.visible');
        cy.contains('Puede pasar de 23 h según las sesiones que le toquen').should('be.visible');
      });

      cy.contains(texts.unassigned.title).should('be.visible');
      cy.contains('a', '1º Primaria: 1 sin profesor').should('be.visible');
      cy.contains('a', '3º Primaria: 4 sin profesor').should('be.visible');
      cy.contains('a', '6º Primaria: 1 sin profesor').should('be.visible');
    });
  });

  it('goes from the notice to the matrix of the course and from a professor to their availability', () => {
    seed(uniqueAdmin()).then((ids) => {
      openFromProfessors();

      cy.contains('a', '1º Primaria: 1 sin profesor').click();
      cy.location('pathname').should('equal', `/cursos/${ids.firstCourse}/profesores`);

      cy.go('back');
      cy.wait('@getSummary');
      cy.get('a[aria-label="Editar la disponibilidad de García, Ana"]').click();
      cy.location('pathname').should('equal', `/profesores/${ids.ana}/disponibilidad`);
    });
  });

  it('filters by status and by subject, searches by name, keeps only the ones with warnings and clears the filters', () => {
    seed(uniqueAdmin()).then(() => {
      openFromProfessors();

      cy.get('#professors-summary-status').select(texts.statuses.MAY_EXCEED);
      cy.get('tbody tr').should('have.length', 1);
      count().should('have.text', '1 profesor');
      rowOf('Soto, Pedro').should('be.visible');

      cy.get('#professors-summary-status').select(texts.filters.all);
      cy.get('tbody tr').should('have.length', 4);

      cy.get('#professors-summary-subject').select('Lengua');
      cy.get('tbody tr').should('have.length', 1);
      rowOf('García, Ana').should('be.visible');

      cy.get('#professors-summary-subject').select(texts.filters.allSubjects);
      cy.get('#professors-summary-search').type('perez');
      cy.get('tbody tr').should('have.length', 1);
      rowOf('Pérez, Eva').should('be.visible');

      cy.get('#professors-summary-search').clear();
      cy.contains('label', texts.filters.onlyWithWarnings).click();
      cy.get('tbody tr').should('have.length', 3);
      cy.contains('tbody tr', 'Ruiz, Luis').should('not.exist');

      cy.get('#professors-summary-search').type('nadie');
      cy.contains(texts.noMatches).should('be.visible');
      cy.contains('button', texts.filters.clear).click();
      cy.get('tbody tr').should('have.length', 4);
      cy.focused().should('have.attr', 'type', 'search');
    });
  });

  it('is the same for a member', () => {
    const admin = uniqueAdmin();
    seed(admin).then(() => {
      loginAsMember(admin);
      cy.visit('/profesores/resumen');
      cy.wait('@getSummary');

      cy.contains('h1', texts.title).should('be.visible');
      cy.get('tbody tr').should('have.length', 4);
      cy.contains('a', '3º Primaria: 4 sin profesor').should('be.visible');
    });
  });

  it('shows cards without horizontal scroll at 360 px', () => {
    seed(uniqueAdmin()).then(() => {
      cy.viewport(360, 740);
      cy.visit('/profesores/resumen');
      cy.wait('@getSummary');

      cy.get('table').should('not.exist');
      cy.get(`ul[aria-label="${texts.list}"] > li`).should('have.length', 4);
      cy.contains('li', 'Soto, Pedro').within(() => {
        cy.contains('22 h 30 min – 25 h').should('be.visible');
        cy.contains(texts.statuses.MAY_EXCEED).should('be.visible');
      });
      expectNoHorizontalScroll();

      cy.get('#professors-summary-status').select(texts.statuses.NO_LOAD);
      cy.get(`ul[aria-label="${texts.list}"] > li`).should('have.length', 1);
      expectNoHorizontalScroll();
    });
  });
});
