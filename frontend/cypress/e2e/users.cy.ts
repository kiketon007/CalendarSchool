import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}u${sequence}`;
  return {
    schoolName: `Colegio Usuarios ${id}`,
    email: `usuarios.${id}@example.com`,
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

/** Crea un miembro en el colegio del administrador (todavía no hay invitaciones). */
function createMember(admin: TestAdmin) {
  const email = admin.email.replace('usuarios.', 'miembro.');
  return cy
    .task('createUser', { schoolEmail: admin.email, email, password: PASSWORD, role: 'MEMBER' })
    .then(() => email);
}

const usersLink = () => cy.contains('a', es.header.users);
const logoutButton = () => cy.contains('button', es.header.logout);
const userRows = () => cy.get('[data-testid="users-page"] table tbody tr');

describe('school users', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/auth/refresh').as('refresh');
  });

  it('lists the users of the school to an administrator who opens the page from the navigation', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createMember(admin).then((memberEmail) => {
      cy.visit('/onboarding');
      cy.intercept('GET', '/api/users').as('users');

      usersLink().click();

      cy.wait('@users').its('response.statusCode').should('equal', 200);
      cy.location('pathname').should('equal', '/usuarios');
      userRows().should('have.length', 2);
      userRows()
        .eq(0)
        .should('contain', admin.email)
        .and('contain', es.users.role.ADMIN)
        .and('contain', es.users.status.ACTIVE);
      userRows().eq(1).should('contain', memberEmail).and('contain', es.users.role.MEMBER);
    });
  });

  it('does not show the Users link to a member, and takes them to onboarding if they open the page', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createMember(admin).then((memberEmail) => {
      cy.clearCookies();
      cy.visit('/login');
      cy.get('#login-email').type(memberEmail);
      cy.get('#login-password').type(PASSWORD);
      cy.get('button[type="submit"]').click();
      cy.location('pathname').should('equal', '/onboarding');

      cy.get('[data-testid="app-header"]').should('be.visible');
      usersLink().should('not.exist');
      cy.visit('/usuarios');

      cy.location('pathname').should('equal', '/onboarding');
      cy.get('[data-testid="users-page"]').should('not.exist');
      cy.get('[role="alert"]').should('not.exist');
    });
  });

  it('answers 403 FORBIDDEN to a member who calls the API directly', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createMember(admin).then((memberEmail) => {
      cy.clearCookies();
      cy.request({
        method: 'POST',
        url: '/api/auth/login',
        headers: { Origin: 'http://localhost:4173' },
        body: { email: memberEmail, password: PASSWORD, captcha: { version: 'v3', token: 'e2e' } },
      });
      cy.request({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { Origin: 'http://localhost:4173' },
      })
        .its('body.data.session.accessToken')
        .then((accessToken) => {
          cy.request({
            url: '/api/users',
            failOnStatusCode: false,
            headers: { Authorization: `Bearer ${accessToken}` },
          }).then((response) => {
            expect(response.status).to.equal(403);
            expect((response.body as { error: { code: string } }).error.code).to.equal('FORBIDDEN');
          });
        });
    });
  });

  it('takes the user to the login page when the page is opened after logging out', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/usuarios');
    userRows().should('have.length', 1);

    logoutButton().click();
    cy.location('pathname').should('equal', '/login');
    cy.visit('/usuarios');

    cy.location('pathname').should('equal', '/login');
    cy.get('[data-testid="users-page"]').should('not.exist');
  });

  it('renews the session on its own when the access token has expired and shows the list', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/onboarding');
    cy.wait('@refresh');
    cy.intercept(
      { method: 'GET', url: '/api/users', times: 1 },
      {
        statusCode: 401,
        body: {
          success: false,
          error: { code: 'INVALID_SESSION', message: 'La sesión no es válida' },
        },
      },
    ).as('expiredToken');

    usersLink().click();

    cy.wait('@expiredToken');
    cy.wait('@refresh').its('response.statusCode').should('equal', 200);
    userRows().should('have.length', 1);
    cy.get('[role="alert"]').should('not.exist');
  });

  it('shows an alert with a retry button when the list cannot be loaded, and loads it on retry', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/onboarding');
    cy.intercept(
      { method: 'GET', url: '/api/users', times: 1 },
      {
        statusCode: 503,
        body: {
          success: false,
          error: { code: 'DATABASE_UNAVAILABLE', message: 'La base de datos no está disponible' },
        },
      },
    ).as('failingUsers');

    usersLink().click();

    cy.wait('@failingUsers');
    cy.contains('[role="alert"]', es.users.loadError).should('be.visible');
    cy.get('[data-testid="users-page"] table').should('not.exist');
    cy.contains('button', es.users.retry).click();

    userRows().should('have.length', 1);
    cy.get('[role="alert"]').should('not.exist');
  });
});
