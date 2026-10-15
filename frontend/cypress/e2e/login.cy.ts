import es from '../../src/i18n/es.json';

const REFRESH_COOKIE = 'refresh_token';
const SECONDS_PER_DAY = 24 * 60 * 60;

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueUser() {
  sequence += 1;
  const id = `${runId}l${sequence}`;
  return {
    schoolName: `Colegio Login ${id}`,
    email: `login.${id}@example.com`,
    password: 'Secreta123!',
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestUser = ReturnType<typeof uniqueUser>;

const registrationField = (name: string) => cy.get(`#registration-${name}`);
const loginField = (name: 'email' | 'password') => cy.get(`#login-${name}`);
const submitLogin = () => cy.get('button[type="submit"]').click();

/** Registra al usuario desde el formulario y espera a estar en Onboarding (con la sesión iniciada). */
function registerThroughTheForm(user: TestUser) {
  cy.visit('/registro');
  registrationField('schoolName').type(user.schoolName);
  registrationField('municipalityCode').type('valen');
  cy.contains('[role="option"]', 'València').click();
  registrationField('firstName').type(user.firstName);
  registrationField('lastName').type(user.lastName);
  registrationField('email').type(user.email);
  registrationField('password').type(user.password);
  registrationField('privacyPolicyAccepted').check();
  cy.get('button[type="submit"]').click();
  cy.location('pathname').should('equal', '/onboarding');
}

/** Alta directa por la API: deja la cookie de sesión en el navegador, igual que el formulario. */
function registerViaApi(user: TestUser) {
  return cy.request({
    method: 'POST',
    url: '/api/auth/register',
    body: { ...user, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
  });
}

/** Crea un usuario y deja el navegador sin sesión, como quien vuelve al día siguiente. */
function registeredUserWithoutSession(): Cypress.Chainable<TestUser> {
  const user = uniqueUser();
  return registerViaApi(user).then(() => {
    cy.clearCookies();
    return cy.wrap(user);
  });
}

function fillLogin(email: string, password: string) {
  loginField('email').type(email);
  loginField('password').type(password);
}

describe('login', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/auth/login').as('login');
  });

  describe('coming back after losing the session', () => {
    it('registers, loses the session, is sent to the login and gets back to onboarding', () => {
      const user = uniqueUser();
      registerThroughTheForm(user);
      cy.clearCookies();

      // Sin sesión, Onboarding lleva al inicio de sesión.
      cy.visit('/onboarding');
      cy.location('pathname').should('equal', '/login');
      cy.get('[data-testid="login-page"]').should('be.visible');

      fillLogin(user.email, user.password);
      submitLogin();

      cy.wait('@login').then(({ request, response }) => {
        expect(request.body).to.include({ email: user.email, password: user.password });
        expect((request.body as { captcha: { version: string } }).captcha.version).to.equal('v3');
        expect(response?.statusCode).to.equal(204);
        expect(response?.body).to.equal('');
      });
      cy.location('pathname').should('equal', '/onboarding');
      cy.get('[data-testid="onboarding-page"]')
        .should('be.visible')
        .and('contain', user.schoolName);
    });

    it('sets the session cookie as httpOnly, secure and sameSite=lax, for 24 hours, out of reach of scripts', () => {
      registeredUserWithoutSession().then((user) => {
        cy.visit('/login');
        fillLogin(user.email, user.password);
        submitLogin();
        cy.location('pathname').should('equal', '/onboarding');

        cy.getCookie(REFRESH_COOKIE).then((cookie) => {
          expect(cookie, 'cookie de sesión').to.not.equal(null);
          expect(cookie).to.include({ httpOnly: true, secure: true, sameSite: 'lax' });
          expect(cookie?.path).to.equal('/api/auth');
          const remaining = (cookie?.expiry ?? 0) - Date.now() / 1000;
          expect(remaining).to.be.within(SECONDS_PER_DAY - 120, SECONDS_PER_DAY);
        });
        cy.document().its('cookie').should('not.contain', REFRESH_COOKIE);
      });
    });

    it('keeps no token or password in the storage of the browser', () => {
      registeredUserWithoutSession().then((user) => {
        cy.visit('/login');
        fillLogin(user.email, user.password);
        submitLogin();
        cy.location('pathname').should('equal', '/onboarding');

        cy.window().then((win) => {
          const stored = JSON.stringify({ ...win.localStorage, ...win.sessionStorage });
          expect(stored).not.to.include(user.password);
          expect(stored).not.to.match(/eyJ|token/i);
        });
      });
    });

    it('accepts the email in capitals and with spaces', () => {
      registeredUserWithoutSession().then((user) => {
        cy.visit('/login');
        fillLogin(`  ${user.email.toUpperCase()}  `, user.password);
        submitLogin();

        cy.location('pathname').should('equal', '/onboarding');
      });
    });

    it('keeps the session after reloading onboarding', () => {
      registeredUserWithoutSession().then((user) => {
        cy.visit('/login');
        fillLogin(user.email, user.password);
        submitLogin();
        cy.get('[data-testid="onboarding-page"]').should('be.visible');

        cy.reload();

        cy.location('pathname').should('equal', '/onboarding');
        cy.get('[data-testid="onboarding-page"]').should('contain', user.schoolName);
      });
    });
  });

  describe('a user that already has a session', () => {
    it('is taken from /login to onboarding without seeing the form', () => {
      registerViaApi(uniqueUser());

      cy.visit('/login');

      cy.location('pathname').should('equal', '/onboarding');
      cy.get('[data-testid="onboarding-page"]').should('be.visible');
      cy.get('[data-testid="login-page"]').should('not.exist');
    });
  });

  describe('credentials that are not valid', () => {
    it('shows the generic message, keeps the email and empties the password', () => {
      registeredUserWithoutSession().then((user) => {
        cy.visit('/login');
        fillLogin(user.email, 'Otra123456!');
        submitLogin();

        cy.wait('@login').its('response.statusCode').should('equal', 401);
        cy.contains('[role="alert"]', es.login.server.invalidCredentials).should('be.visible');
        loginField('email').should('have.value', user.email);
        loginField('password').should('have.value', '');
        cy.location('pathname').should('equal', '/login');
        cy.getCookie(REFRESH_COOKIE).should('equal', null);
      });
    });

    it('shows exactly the same message for an email that is not registered', () => {
      cy.visit('/login');
      fillLogin(`nadie.${runId}@example.com`, 'Otra123456!');
      submitLogin();

      cy.wait('@login').its('response.statusCode').should('equal', 401);
      cy.contains('[role="alert"]', es.login.server.invalidCredentials).should('be.visible');
      cy.get('[role="alert"]').should('have.length', 1);
    });

    it('lets the user try again with the right password after a failure', () => {
      registeredUserWithoutSession().then((user) => {
        cy.visit('/login');
        fillLogin(user.email, 'Otra123456!');
        submitLogin();
        cy.contains('[role="alert"]', es.login.server.invalidCredentials).should('be.visible');

        loginField('password').type(user.password);
        submitLogin();

        cy.location('pathname').should('equal', '/onboarding');
      });
    });

    it('does not send the form when the fields are empty or the email is malformed', () => {
      cy.visit('/login');

      submitLogin();

      cy.contains('[role="alert"]', es.login.errors.email.REQUIRED).should('be.visible');
      cy.contains('[role="alert"]', es.login.errors.password.REQUIRED).should('be.visible');
      loginField('email').should('be.focused');

      loginField('email').type('sin-arroba');
      loginField('password').type('x');
      submitLogin();
      cy.contains('[role="alert"]', es.login.errors.email.INVALID_FORMAT).should('be.visible');
      cy.get('@login.all').should('have.length', 0);
    });
  });

  describe('a suspended account', () => {
    it('gets the specific message, no session, and the form is still usable', () => {
      registeredUserWithoutSession().then((user) => {
        cy.task('setUserStatus', { email: user.email, status: 'SUSPENDED' }).should('equal', 1);
        cy.visit('/login');

        fillLogin(user.email, user.password);
        submitLogin();

        cy.wait('@login').its('response.statusCode').should('equal', 403);
        cy.contains('[role="alert"]', es.login.server.accountSuspended).should('be.visible');
        cy.location('pathname').should('equal', '/login');
        cy.getCookie(REFRESH_COOKIE).should('equal', null);
        cy.get('button[type="submit"]').should('be.enabled');
      });
    });

    it('does not reveal the state of the account to whoever does not know the password', () => {
      registeredUserWithoutSession().then((user) => {
        cy.task('setUserStatus', { email: user.email, status: 'SUSPENDED' }).should('equal', 1);
        cy.visit('/login');

        fillLogin(user.email, 'Otra123456!');
        submitLogin();

        cy.wait('@login').its('response.statusCode').should('equal', 401);
        cy.contains('[role="alert"]', es.login.server.invalidCredentials).should('be.visible');
        cy.get('[role="alert"]').should('not.contain', es.login.server.accountSuspended);
      });
    });
  });

  describe('the v2 challenge', () => {
    /** Cambia el token del primer envío por uno de los reservados del verificador falso del backend. */
    function replaceFirstCaptchaToken(token: string) {
      cy.intercept({ method: 'POST', url: '/api/auth/login', times: 1 }, (request) => {
        (request.body as { captcha: { token: string } }).captcha.token = token;
        request.continue();
      }).as('tamperedLogin');
    }

    it('is shown when the score is low, keeps the data and, once solved, completes the login', () => {
      replaceFirstCaptchaToken('fake-low-score');
      registeredUserWithoutSession().then((user) => {
        cy.visit('/login');
        fillLogin(user.email, user.password);

        submitLogin();

        cy.wait('@tamperedLogin').its('response.statusCode').should('equal', 422);
        cy.contains(es.captcha.challenge).should('be.visible');
        cy.get('[data-testid="captcha-challenge"] button').should('be.visible');
        // El reto no es un error: se conservan los datos, la contraseña incluida, y no hay alertas.
        loginField('password').should('have.value', user.password);
        cy.get('[role="alert"]').should('not.exist');
        cy.get('button[type="submit"]').should('be.disabled');

        cy.contains(
          '[data-testid="captcha-challenge"] button',
          es.captcha.fakeChallengeButton,
        ).click();
        cy.get('button[type="submit"]').should('be.enabled').click();

        cy.wait('@login').then(({ request, response }) => {
          expect((request.body as { captcha: unknown }).captcha).to.deep.equal({
            version: 'v2',
            token: 'fake-v2-token',
          });
          expect(response?.statusCode).to.equal(204);
        });
        cy.location('pathname').should('equal', '/onboarding');
      });
    });

    it('shows that the verification failed when the server rejects the token', () => {
      replaceFirstCaptchaToken('fake-fail');
      cy.visit('/login');
      fillLogin(`nadie.${runId}@example.com`, 'Otra123456!');

      submitLogin();

      cy.wait('@tamperedLogin').its('response.statusCode').should('equal', 422);
      cy.contains('[role="alert"]', es.captcha.failed).should('be.visible');
      loginField('password').should('have.value', '');
    });

    it('shows a temporary error, without technical details, when Google is not available', () => {
      replaceFirstCaptchaToken('fake-unavailable');
      cy.visit('/login');
      fillLogin(`nadie.${runId}@example.com`, 'Otra123456!');

      submitLogin();

      cy.wait('@tamperedLogin').its('response.statusCode').should('equal', 503);
      cy.contains('[role="alert"]', es.login.server.unavailable).should('be.visible');
      cy.get('[role="alert"]').should('not.contain', 'CAPTCHA');
    });
  });

  describe('failures of the service', () => {
    it('shows how many minutes to wait when there are too many attempts', () => {
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 429,
        headers: { 'Retry-After': '840' },
        body: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'límite' } },
      }).as('limited');
      cy.visit('/login');
      fillLogin('alguien@example.com', 'Secreta123!');

      submitLogin();

      cy.wait('@limited');
      cy.contains('[role="alert"]', '14 minutos').should('be.visible');
      loginField('password').should('have.value', '');
    });

    it('warns that cookies are needed when the browser does not keep the session', () => {
      registeredUserWithoutSession().then((user) => {
        cy.intercept('POST', '/api/auth/refresh', {
          statusCode: 401,
          body: { success: false, error: { code: 'INVALID_SESSION', message: 'no válida' } },
        });
        cy.visit('/login');

        fillLogin(user.email, user.password);
        submitLogin();

        cy.wait('@login').its('response.statusCode').should('equal', 204);
        cy.contains('[role="alert"]', es.login.session.cookiesDisabled).should('be.visible');
        cy.location('pathname').should('equal', '/login');
        loginField('email').should('have.value', user.email);
      });
    });

    it('shows a temporary error, without technical details, when there is no connection', () => {
      cy.intercept('POST', '/api/auth/login', { forceNetworkError: true }).as('offline');
      cy.visit('/login');
      fillLogin('alguien@example.com', 'Secreta123!');

      submitLogin();

      cy.contains('[role="alert"]', es.login.server.unavailable).should('be.visible');
      cy.get('[role="alert"]').should('not.contain', 'Failed to fetch');
    });
  });

  describe('the page', () => {
    it('links to the registration, and the registration links back to the login', () => {
      cy.visit('/login');

      cy.contains('a', es.login.register.link).click();

      cy.location('pathname').should('equal', '/registro');
      cy.get('[data-testid="register-page"]').should('be.visible');
    });

    it('is reached from the link of an already registered email in the registration form', () => {
      const user = uniqueUser();
      registerViaApi(user);
      cy.clearCookies();
      cy.visit('/registro');
      registrationField('schoolName').type(`Otro ${user.schoolName}`);
      registrationField('municipalityCode').type('valen');
      cy.contains('[role="option"]', 'València').click();
      registrationField('firstName').type(user.firstName);
      registrationField('lastName').type(user.lastName);
      registrationField('email').type(user.email);
      registrationField('password').type(user.password);
      registrationField('privacyPolicyAccepted').check();
      cy.get('button[type="submit"]').click();

      cy.contains('a', es.registration.server.goToLogin).click();

      cy.location('pathname').should('equal', '/login');
      cy.get('[data-testid="login-page"]').should('be.visible');
    });

    it('shows the Google notice and does not load the script of Google without site keys', () => {
      cy.visit('/login');

      cy.contains('a', es.captcha.privacy.privacyLink).should(
        'have.attr',
        'href',
        'https://policies.google.com/privacy',
      );
      cy.get('script[src*="recaptcha"]').should('not.exist');
    });
  });
});
