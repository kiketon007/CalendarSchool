import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}o${sequence}`;
  return {
    schoolName: `Colegio Bienvenida ${id}`,
    email: `bienvenida.${id}@example.com`,
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

const features = es.onboarding.features;
/** Las siete secciones de trabajo, en el orden de la portada. */
const SECTIONS = [
  ['schedules', '/horarios'],
  ['courses', '/cursos'],
  ['professors', '/profesores'],
  ['students', '/alumnos'],
  ['calendars', '/calendarios'],
  ['subjects', '/asignaturas'],
  ['constraints', '/reglas'],
] as const;
const homePage = () => cy.get('[data-testid="onboarding-page"]');
const sectionLinks = () => cy.get('[data-testid="onboarding-page"] a');
const appNameLink = () => cy.contains('[data-testid="app-sidebar"] a', es.app.name);
const homeLink = () => cy.contains('[data-testid="app-sidebar"] a', es.shell.home);

function expectNoHorizontalScroll() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(
      document.documentElement.clientWidth,
    );
  });
}

/** Posición de cada tarjeta de sección (enlaces de la portada), en el orden del documento. */
function cardRects() {
  return sectionLinks().then(($cards) =>
    $cards.toArray().map((card) => card.getBoundingClientRect()),
  );
}

function expectSevenSections() {
  for (const [key, to] of SECTIONS) {
    cy.contains('[data-testid="onboarding-page"] a', features[key].name)
      .should('have.attr', 'href', to)
      .and('contain', features[key].description);
  }
}

describe('welcome screen', () => {
  it('shows an administrator the greeting, the date, the school and the seven sections, and lets them go to a section, to Users and back', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);

    cy.visit('/onboarding');

    homePage()
      .should('be.visible')
      .and('contain', admin.schoolName)
      .find('h1')
      .should('contain', admin.firstName);
    homePage()
      .find('time')
      .should('be.visible')
      .invoke('attr', 'datetime')
      .should('match', /^\d{4}-\d{2}-\d{2}$/);
    expectSevenSections();
    homePage().should('not.contain', 'Comedor').and('not.contain', 'Próximamente');
    homeLink().should('have.attr', 'aria-current', 'page');
    appNameLink().should('not.have.attr', 'aria-current');

    cy.contains('[data-testid="onboarding-page"] a', features.schedules.name).click();

    cy.location('pathname').should('equal', '/horarios');
    homeLink().click();
    cy.location('pathname').should('equal', '/onboarding');

    cy.intercept('GET', '/api/users').as('users');
    cy.contains('[data-testid="onboarding-page"] a', es.onboarding.admin.users.name).click();

    cy.wait('@users').its('response.statusCode').should('equal', 200);
    cy.location('pathname').should('equal', '/usuarios');
    homeLink().should('not.have.attr', 'aria-current');

    appNameLink().click();

    cy.location('pathname').should('equal', '/onboarding');
    homePage().should('contain', admin.schoolName);
  });

  it('shows a member the seven sections but not the administration section', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    const memberEmail = admin.email.replace('bienvenida.', 'miembro.');
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
    homePage().should('contain', admin.schoolName);
    expectSevenSections();
    sectionLinks().should('have.length', 7);
    cy.contains(es.onboarding.admin.title).should('not.exist');
    cy.contains('[data-testid="onboarding-page"] a', es.onboarding.admin.users.name).should(
      'not.exist',
    );
  });

  it('stacks the cards in one column on a 360 px screen without horizontal scrolling', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    cy.viewport(360, 740);

    cy.visit('/onboarding');

    expectSevenSections();
    cardRects().then((rects) => {
      expect(rects).to.have.length(8);
      rects.forEach((rect, index) => {
        expect(rect.left).to.equal(rects[0]?.left);
        expect(rect.height).to.be.at.least(44);
        if (index > 0) {
          expect(rect.top).to.be.greaterThan((rects[index - 1]?.bottom ?? 0) - 1);
        }
      });
    });
    expectNoHorizontalScroll();
  });

  it('shows four cards per row on a 1280 px screen without horizontal scrolling', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    cy.viewport(1280, 800);

    cy.visit('/onboarding');

    expectSevenSections();
    cardRects().then((rects) => {
      const firstRow = rects.slice(0, 4);
      firstRow.forEach((rect) => {
        expect(rect.top).to.equal(firstRow[0]?.top);
      });
      expect(rects[4]?.top).to.be.greaterThan((firstRow[0]?.bottom ?? 0) - 1);
      expect(rects[4]?.left).to.equal(firstRow[0]?.left);
    });
    expectNoHorizontalScroll();
  });
});
