import es from '../../src/i18n/es.json';

const REFRESH_COOKIE = 'refresh_token';
const APP_ORIGIN = 'http://localhost:4173';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueUser() {
  sequence += 1;
  const id = `${runId}o${sequence}`;
  return {
    schoolName: `Colegio Cierre ${id}`,
    email: `cierre.${id}@example.com`,
    password: 'Secreta123!',
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestUser = ReturnType<typeof uniqueUser>;

/** Valor de la cookie de sesión que fija una respuesta de la API. */
function sessionCookieOf(response: Cypress.Response<unknown>): string {
  const prefix = `${REFRESH_COOKIE}=`;
  const header = (response.headers['set-cookie'] as string[]).find((cookie) =>
    cookie.startsWith(prefix),
  );
  expect(header, 'cabecera Set-Cookie del refresh token').to.be.a('string');
  return String(header).split(';')[0].slice(prefix.length);
}

/** Alta directa por la API: deja la sesión en el navegador y devuelve el valor de su cookie. */
function registerViaApi(user: TestUser): Cypress.Chainable<string> {
  return cy
    .request({
      method: 'POST',
      url: '/api/auth/register',
      body: { ...user, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
    })
    .then(sessionCookieOf);
}

/** Inicio de sesión directo por la API (otro navegador): el navegador pasa a tener esa cookie. */
function loginViaApi(user: TestUser): Cypress.Chainable<string> {
  return cy
    .request({
      method: 'POST',
      url: '/api/auth/login',
      headers: { Origin: APP_ORIGIN },
      body: {
        email: user.email,
        password: user.password,
        captcha: { version: 'v3', token: 'e2e' },
      },
    })
    .then(sessionCookieOf);
}

function refreshViaApi(cookieValue: string) {
  return cy.request({
    method: 'POST',
    url: '/api/auth/refresh',
    failOnStatusCode: false,
    headers: { Cookie: `${REFRESH_COOKIE}=${cookieValue}`, Origin: APP_ORIGIN },
  });
}

const logoutButton = () => cy.contains('button', es.header.logout);

describe('logout', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/auth/refresh').as('refresh');
    cy.intercept('POST', '/api/auth/logout').as('logout');
  });

  it('shows the header with the user and the school, and closes the session from it', () => {
    const user = uniqueUser();
    registerViaApi(user);

    cy.visit('/onboarding');

    cy.get('[data-testid="app-header"]')
      .should('be.visible')
      .and('contain', `${user.firstName} ${user.lastName}`)
      .and('contain', user.schoolName);
    logoutButton().click();

    cy.wait('@logout').its('response.statusCode').should('equal', 204);
    cy.location('pathname').should('equal', '/login');
    cy.get('[data-testid="login-page"]').should('be.visible');
    cy.get('[data-testid="app-header"]').should('not.exist');
    cy.get('[role="dialog"]').should('not.exist');
    cy.getCookie(REFRESH_COOKIE).should('equal', null);
  });

  it('does not bring the session back after reloading or going back to onboarding', () => {
    registerViaApi(uniqueUser());
    cy.visit('/onboarding');
    logoutButton().click();
    cy.location('pathname').should('equal', '/login');
    cy.intercept('POST', '/api/auth/refresh').as('refreshAfterLogout');

    cy.reload();

    cy.wait('@refreshAfterLogout').its('response.statusCode').should('equal', 401);
    cy.location('pathname').should('equal', '/login');
    // Volver a Onboarding (el botón «Atrás» o un enlace guardado) tampoco la recupera.
    cy.visit('/onboarding');
    cy.location('pathname').should('equal', '/login');
    cy.get('[data-testid="onboarding-page"]').should('not.exist');
  });

  it('revokes the refresh token on the server: it no longer renews the session', () => {
    registerViaApi(uniqueUser()).then((closedCookie) => {
      refreshViaApi(closedCookie).its('status').should('equal', 200);
      cy.visit('/onboarding');
      logoutButton().click();
      cy.wait('@logout').its('response.statusCode').should('equal', 204);

      refreshViaApi(closedCookie).then((response) => {
        expect(response.status).to.equal(401);
        expect((response.body as { error: { code: string } }).error.code).to.equal(
          'INVALID_SESSION',
        );
      });
    });
  });

  it('leaves the sessions of other browsers open', () => {
    const user = uniqueUser();
    registerViaApi(user).then((otherBrowserCookie) => {
      // El navegador pasa a la sesión del login; la del alta queda como la de «otro navegador».
      loginViaApi(user);
      cy.visit('/onboarding');
      logoutButton().click();
      cy.wait('@logout').its('response.statusCode').should('equal', 204);

      refreshViaApi(otherBrowserCookie).its('status').should('equal', 200);
    });
  });

  it('keeps the session and warns when the server does not confirm the logout, and lets the user retry', () => {
    registerViaApi(uniqueUser());
    cy.intercept(
      { method: 'POST', url: '/api/auth/logout', times: 1 },
      {
        statusCode: 503,
        body: { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'caída' } },
      },
    ).as('failingLogout');
    cy.visit('/onboarding');

    logoutButton().click();

    cy.wait('@failingLogout');
    cy.contains('[role="alert"]', es.header.logoutError).should('be.visible');
    cy.location('pathname').should('equal', '/onboarding');
    cy.get('[data-testid="app-header"]').should('be.visible');
    cy.getCookie(REFRESH_COOKIE).should('not.equal', null);

    logoutButton().should('be.enabled').click();

    cy.wait('@logout').its('response.statusCode').should('equal', 204);
    cy.location('pathname').should('equal', '/login');
    cy.get('[role="alert"]').should('not.exist');
  });

  it('does not show the header to a visitor without a session', () => {
    cy.clearCookies();

    cy.visit('/login');

    cy.wait('@refresh').its('response.statusCode').should('equal', 401);
    cy.get('[data-testid="login-page"]').should('be.visible');
    cy.get('[data-testid="app-header"]').should('not.exist');
  });
});
