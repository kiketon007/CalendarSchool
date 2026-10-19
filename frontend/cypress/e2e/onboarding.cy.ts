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
const homePage = () => cy.get('[data-testid="onboarding-page"]');
const appNameLink = () => cy.contains('[data-testid="app-header"] a', es.app.name);

describe('welcome screen', () => {
  it('shows an administrator the greeting, the school and both features as coming soon, and lets them go to Users and back', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);

    cy.visit('/onboarding');

    homePage()
      .should('be.visible')
      .and('contain', admin.firstName)
      .and('contain', admin.schoolName);
    for (const feature of [features.schedules, features.canteen]) {
      cy.contains('article', feature.name)
        .should('contain', feature.description)
        .and('contain', es.onboarding.comingSoon)
        .find('a, button')
        .should('not.exist');
    }
    appNameLink().should('have.attr', 'aria-current', 'page');

    cy.intercept('GET', '/api/users').as('users');
    cy.contains('main a', es.onboarding.admin.users.name).click();

    cy.wait('@users').its('response.statusCode').should('equal', 200);
    cy.location('pathname').should('equal', '/usuarios');
    appNameLink().should('not.have.attr', 'aria-current');

    appNameLink().click();

    cy.location('pathname').should('equal', '/onboarding');
    homePage().should('contain', admin.schoolName);
  });

  it('shows a member the features but not the administration section', () => {
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
    cy.contains('article', features.schedules.name).should('be.visible');
    cy.contains('article', features.canteen.name).should('be.visible');
    cy.contains(es.onboarding.admin.title).should('not.exist');
    cy.contains('main a', es.onboarding.admin.users.name).should('not.exist');
  });

  it('stacks the cards in one column on a 360 px screen without horizontal scrolling', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    cy.viewport(360, 740);

    cy.visit('/onboarding');

    cy.contains('article', features.schedules.name).should('be.visible');
    cy.contains('article', features.canteen.name).should('be.visible');
    cy.get('article').then(($cards) => {
      const first = $cards[0].getBoundingClientRect();
      const second = $cards[1].getBoundingClientRect();
      expect(second.top).to.be.greaterThan(first.bottom - 1);
      expect(second.left).to.equal(first.left);
    });
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
    cy.contains('main a', es.onboarding.admin.users.name)
      .invoke('outerHeight')
      .should('be.at.least', 44);
  });

  it('shows two cards per row on a wide screen', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    cy.viewport(1280, 800);

    cy.visit('/onboarding');

    cy.get('article').then(($cards) => {
      const first = $cards[0].getBoundingClientRect();
      const second = $cards[1].getBoundingClientRect();
      expect(second.top).to.equal(first.top);
      expect(second.left).to.be.greaterThan(first.right - 1);
    });
  });
});
