import es from '../../src/i18n/es.json';

const REFRESH_COOKIE = 'refresh_token';
const SECONDS_PER_DAY = 24 * 60 * 60;
const APP_ORIGIN = 'http://localhost:4173';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueUser() {
  sequence += 1;
  const id = `${runId}s${sequence}`;
  return {
    schoolName: `Colegio Sesión ${id}`,
    email: `sesion.${id}@example.com`,
    password: 'Secreta123!',
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestUser = ReturnType<typeof uniqueUser>;

const field = (name: string) => cy.get(`#registration-${name}`);

function fillForm(user: TestUser) {
  field('schoolName').type(user.schoolName);
  field('municipalityCode').type('valen');
  cy.contains('[role="option"]', 'València').click();
  field('firstName').type(user.firstName);
  field('lastName').type(user.lastName);
  field('email').type(user.email);
  field('password').type(user.password);
}

/** Registra al usuario desde el formulario y espera a estar en Onboarding. */
function registerThroughTheForm(user: TestUser) {
  cy.visit('/registro');
  fillForm(user);
  cy.get('button[type="submit"]').click();
  cy.location('pathname').should('equal', '/onboarding');
}

/** Alta directa por la API; devuelve el valor de la cookie de sesión que fija el servidor. */
function registerViaApi(user: TestUser): Cypress.Chainable<string> {
  return cy
    .request({
      method: 'POST',
      url: '/api/auth/register',
      body: { ...user, captcha: { version: 'v3', token: 'e2e' } },
    })
    .then((response) => {
      const prefix = `${REFRESH_COOKIE}=`;
      const header = (response.headers['set-cookie'] as string[]).find((cookie) =>
        cookie.startsWith(prefix),
      );
      expect(header, 'cabecera Set-Cookie del refresh token').to.be.a('string');
      return String(header).split(';')[0].slice(prefix.length);
    });
}

function refreshViaApi(cookieValue: string | undefined, headers: Record<string, string> = {}) {
  return cy.request({
    method: 'POST',
    url: '/api/auth/refresh',
    failOnStatusCode: false,
    headers: {
      ...(cookieValue === undefined ? {} : { Cookie: `${REFRESH_COOKIE}=${cookieValue}` }),
      ...headers,
    },
  });
}

describe('session after registration', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/auth/refresh').as('refresh');
  });

  describe('registration flow', () => {
    it('goes to the onboarding page with the school and the user name', () => {
      const user = uniqueUser();

      registerThroughTheForm(user);

      cy.get('[data-testid="onboarding-page"]')
        .should('be.visible')
        .and('contain', user.firstName)
        .and('contain', user.schoolName);
      cy.get('form').should('not.exist');
    });

    it('starts the session with a refresh token cookie that scripts cannot read', () => {
      registerThroughTheForm(uniqueUser());

      cy.getCookie(REFRESH_COOKIE).then((cookie) => {
        expect(cookie, 'cookie de sesión').to.not.equal(null);
        expect(cookie).to.include({ httpOnly: true, secure: true, sameSite: 'lax' });
        expect(cookie?.path).to.equal('/api/auth');
        const remaining = (cookie?.expiry ?? 0) - Date.now() / 1000;
        expect(remaining).to.be.within(SECONDS_PER_DAY - 120, SECONDS_PER_DAY);
      });
      cy.document().its('cookie').should('not.contain', REFRESH_COOKIE);
    });

    it('keeps the access token out of the browser storage', () => {
      registerThroughTheForm(uniqueUser());

      cy.window().then((win) => {
        expect(win.localStorage.length).to.equal(0);
        expect(win.sessionStorage.length).to.equal(0);
      });
    });
  });

  describe('session recovery', () => {
    it('keeps the session after reloading the onboarding page', () => {
      const user = uniqueUser();
      registerThroughTheForm(user);
      // El alias `@refresh` ya recoge las renovaciones del registro: se usa uno nuevo para la de la recarga.
      cy.intercept('POST', '/api/auth/refresh').as('refreshAfterReload');

      cy.reload();

      cy.wait('@refreshAfterReload').its('response.statusCode').should('equal', 200);
      cy.location('pathname').should('equal', '/onboarding');
      cy.get('[data-testid="onboarding-page"]').should('contain', user.schoolName);
    });

    it('redirects to the registration page when there is no session', () => {
      cy.clearCookies();

      cy.visit('/onboarding');

      cy.wait('@refresh').its('response.statusCode').should('equal', 401);
      cy.location('pathname').should('equal', '/registro');
      cy.get('[data-testid="register-page"]').should('be.visible');
      cy.get('[role="alert"]').should('not.exist');
    });

    it('does not show any error on the home page when there is no session', () => {
      cy.clearCookies();

      cy.visit('/');

      cy.wait('@refresh').its('response.statusCode').should('equal', 401);
      cy.get('[data-testid="home-page"]').should('be.visible');
      cy.get('[role="alert"]').should('not.exist');
    });
  });

  describe('when the session cannot be started after the account is created', () => {
    it('warns that cookies are needed, without redirecting or offering the form again', () => {
      const user = uniqueUser();
      cy.intercept('POST', '/api/auth/refresh', {
        statusCode: 401,
        body: { success: false, error: { code: 'INVALID_SESSION', message: 'no válida' } },
      }).as('blockedRefresh');
      cy.intercept('POST', '/api/auth/register').as('register');
      cy.visit('/registro');
      fillForm(user);

      cy.get('button[type="submit"]').click();

      cy.wait('@register').its('response.statusCode').should('equal', 201);
      cy.contains('[role="alert"]', es.registration.session.cookiesDisabled).should('be.visible');
      cy.location('pathname').should('equal', '/registro');
      cy.get('form').should('not.exist');
      cy.get('[data-testid="onboarding-page"]').should('not.exist');
    });

    it('shows a different message, without technical details, when the session cannot be checked', () => {
      const user = uniqueUser();
      cy.intercept('POST', '/api/auth/refresh', { forceNetworkError: true }).as('failingRefresh');
      cy.visit('/registro');
      fillForm(user);

      cy.get('button[type="submit"]').click();

      cy.contains('[role="alert"]', es.registration.session.unavailable).should('be.visible');
      cy.get('[role="alert"]').should('not.contain', es.registration.session.cookiesDisabled);
      cy.location('pathname').should('equal', '/registro');
      cy.get('form').should('not.exist');
    });
  });

  describe('API security', () => {
    it('renews the session for the allowed origin and the cookie of the registration', () => {
      registerViaApi(uniqueUser()).then((token) => {
        refreshViaApi(token, { Origin: APP_ORIGIN }).then((response) => {
          expect(response.status).to.equal(200);
          expect(response.headers['cache-control']).to.equal('no-store');
          const { data } = response.body as {
            data: { session: { expiresIn: number }; user: { role: string } };
          };
          expect(data.session.expiresIn).to.equal(900);
          expect(data.user.role).to.equal('ADMIN');
        });
      });
    });

    it('rejects another origin and a missing origin, and enables no CORS', () => {
      registerViaApi(uniqueUser()).then((token) => {
        refreshViaApi(token, { Origin: 'https://malicioso.example' }).then((response) => {
          expect(response.status).to.equal(403);
          expect((response.body as { error: { code: string } }).error.code).to.equal(
            'ORIGIN_NOT_ALLOWED',
          );
          expect(response.headers).not.to.have.property('access-control-allow-origin');
        });
        refreshViaApi(token).its('status').should('equal', 403);
      });
    });

    it('answers 401 and clears the cookie for a forged or missing session', () => {
      refreshViaApi('token-inventado', { Origin: APP_ORIGIN }).then((response) => {
        expect(response.status).to.equal(401);
        expect((response.body as { error: { code: string } }).error.code).to.equal(
          'INVALID_SESSION',
        );
        expect(String(response.headers['set-cookie'])).to.contain('Max-Age=0');
      });
      refreshViaApi(undefined, { Origin: APP_ORIGIN }).its('status').should('equal', 401);
    });

    it('ignores a session cookie fixed by the client before registering', () => {
      const user = uniqueUser();
      cy.request({
        method: 'POST',
        url: '/api/auth/register',
        headers: { Cookie: `${REFRESH_COOKIE}=fijado-por-el-atacante` },
        body: { ...user, captcha: { version: 'v3', token: 'e2e' } },
      }).then((response) => {
        expect(response.status).to.equal(201);
        expect(String(response.headers['set-cookie'])).not.to.contain('fijado-por-el-atacante');
      });
      refreshViaApi('fijado-por-el-atacante', { Origin: APP_ORIGIN })
        .its('status')
        .should('equal', 401);
    });

    it('sets no cookie when the registration is rejected', () => {
      const user = uniqueUser();
      registerViaApi(user);

      cy.request({
        method: 'POST',
        url: '/api/auth/register',
        failOnStatusCode: false,
        body: { ...user, captcha: { version: 'v3', token: 'e2e' } },
      }).then((response) => {
        expect(response.status).to.equal(409);
        expect(response.headers).not.to.have.property('set-cookie');
      });
    });
  });
});
