import es from '../../src/i18n/es.json';

const errors = es.registration.errors;

interface RegisterBody {
  data: { school: { municipality: { name: string } } };
}
interface MunicipalitiesBody {
  data: { code: string; name: string; province: string }[];
}
const field = (name: string) => cy.get(`#registration-${name}`);

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueUser() {
  sequence += 1;
  const id = `${runId}${sequence}`;
  return {
    schoolName: `Colegio E2E ${id}`,
    email: `e2e.${id}@example.com`,
    password: 'Secreta123!',
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestUser = ReturnType<typeof uniqueUser>;

/** Alta directa por la API, para preparar un colegio o un email ya registrados. */
function registerViaApi(user: TestUser) {
  return cy.request({
    method: 'POST',
    url: '/api/auth/register',
    failOnStatusCode: false,
    body: { ...user, captcha: { version: 'v3', token: 'e2e' } },
  });
}

function chooseMunicipality(search: string, optionName: string) {
  field('municipalityCode').type(search);
  cy.contains('[role="option"]', optionName).click();
}

function fillForm(user: TestUser) {
  field('schoolName').type(user.schoolName);
  chooseMunicipality('valen', 'València');
  field('firstName').type(user.firstName);
  field('lastName').type(user.lastName);
  field('email').type(user.email);
  field('password').type(user.password);
}

const submit = () => cy.get('button[type="submit"]').click();

describe('registration page', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/auth/register').as('register');
  });

  describe('successful registration', () => {
    it('creates the school and the account and goes to the onboarding page', () => {
      const user = uniqueUser();
      cy.visit('/registro');

      fillForm(user);
      submit();

      cy.wait('@register').then(({ request, response }) => {
        expect(request.body).to.include({
          schoolName: user.schoolName,
          municipalityCode: '46250',
          email: user.email,
        });
        expect(response?.statusCode).to.equal(201);
        expect((response?.body as RegisterBody).data.school.municipality.name).to.equal('València');
        expect(JSON.stringify(response?.body)).not.to.match(/password|hash/i);
      });
      cy.location('pathname').should('equal', '/onboarding');
      cy.get('[data-testid="onboarding-page"]')
        .should('be.visible')
        .and('contain', user.schoolName);
      cy.get('form').should('not.exist');
    });

    it('persists the account: registering the same email again is rejected', () => {
      const user = uniqueUser();
      cy.visit('/registro');
      fillForm(user);
      submit();
      cy.get('[data-testid="onboarding-page"]').should('be.visible');

      registerViaApi({ ...user, schoolName: `Otro ${user.schoolName}` })
        .its('body.error.code')
        .should('equal', 'EMAIL_ALREADY_REGISTERED');
    });

    it('selects the municipality with the keyboard', () => {
      cy.visit('/registro');

      field('municipalityCode').type('valen{downArrow}{enter}');

      field('municipalityCode').should('have.value', 'València');
      cy.get('[role="listbox"]').should('not.exist');
    });
  });

  describe('inline validation', () => {
    it('shows an error under every field and sends nothing when the form is empty', () => {
      cy.visit('/registro');
      field('schoolName').should('exist');

      submit();

      field('schoolName').should('have.attr', 'aria-invalid', 'true').and('have.focus');
      cy.contains('[role="alert"]', errors.schoolName.REQUIRED);
      cy.contains('[role="alert"]', errors.municipalityCode.REQUIRED);
      cy.contains('[role="alert"]', errors.firstName.REQUIRED);
      cy.contains('[role="alert"]', errors.lastName.REQUIRED);
      cy.contains('[role="alert"]', errors.email.REQUIRED);
      cy.contains('[role="alert"]', errors.password.REQUIRED);
      cy.get('[role="alert"]').should('have.length', 6);
      cy.get('@register.all').should('have.length', 0);
    });

    it('links each error to its field for assistive technology', () => {
      cy.visit('/registro');
      field('email').type('sin-arroba');
      field('email').blur();

      cy.contains('[role="alert"]', errors.email.INVALID_FORMAT)
        .invoke('attr', 'id')
        .then((errorId) => {
          field('email')
            .should('have.attr', 'aria-invalid', 'true')
            .and('have.attr', 'aria-describedby', errorId);
        });
    });

    it('rejects an invalid email, a short password and a weak password without sending', () => {
      const user = uniqueUser();
      cy.visit('/registro');
      fillForm({ ...user, email: 'usuario@localhost', password: 'Aa1!' });

      submit();

      cy.contains('[role="alert"]', errors.email.INVALID_FORMAT);
      cy.contains('[role="alert"]', errors.password.INVALID_LENGTH);
      field('password').clear();
      field('password').type('secreta1234');
      submit();
      cy.contains('[role="alert"]', errors.password.WEAK_PASSWORD);
      cy.get('@register.all').should('have.length', 0);
    });

    it('rejects a school name with characters that are not allowed', () => {
      const user = uniqueUser();
      cy.visit('/registro');
      fillForm({ ...user, schoolName: '<script>alert(1)</script>' });

      submit();

      cy.contains('[role="alert"]', errors.schoolName.INVALID_CHARACTERS);
      cy.get('@register.all').should('have.length', 0);
    });

    it('does not accept free text as municipality', () => {
      const user = uniqueUser();
      cy.visit('/registro');
      field('schoolName').type(user.schoolName);
      field('municipalityCode').type('ciudad inventada');
      field('firstName').type(user.firstName);
      field('lastName').type(user.lastName);
      field('email').type(user.email);
      field('password').type(user.password);

      submit();

      cy.contains('[role="alert"]', errors.municipalityCode.REQUIRED);
      cy.get('@register.all').should('have.length', 0);
    });
  });

  describe('responses of the server', () => {
    it('says the email is already registered and links to the login', () => {
      const user = uniqueUser();
      registerViaApi(user).its('status').should('equal', 201);
      cy.visit('/registro');
      fillForm({ ...user, schoolName: `Distinto ${user.schoolName}` });

      submit();

      cy.wait('@register').its('response.statusCode').should('equal', 409);
      cy.contains('[role="alert"]', es.registration.server.emailAlreadyRegistered)
        .find('a')
        .should('have.attr', 'href', '/login')
        .and('contain', es.registration.server.goToLogin);
      field('email').should('have.attr', 'aria-invalid', 'true');
    });

    it('says the school is already registered in that municipality, however it is written', () => {
      const user = uniqueUser();
      registerViaApi(user).its('status').should('equal', 201);
      const other = uniqueUser();
      cy.visit('/registro');
      fillForm({ ...other, schoolName: user.schoolName.toUpperCase() });

      submit();

      cy.wait('@register').its('response.statusCode').should('equal', 409);
      cy.contains('[role="alert"]', es.registration.server.schoolAlreadyRegistered);
      field('schoolName').should('have.attr', 'aria-invalid', 'true');
    });

    it('accepts the same school name in another municipality', () => {
      const user = uniqueUser();
      registerViaApi(user).its('status').should('equal', 201);
      registerViaApi({ ...uniqueUser(), schoolName: user.schoolName, municipalityCode: '03014' })
        .its('status')
        .should('equal', 201);
    });

    it('shows a generic message and clears only the password on an unexpected error', () => {
      cy.intercept('POST', '/api/auth/register', {
        statusCode: 500,
        body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'secreto interno' } },
      }).as('failingRegister');
      const user = uniqueUser();
      cy.visit('/registro');
      fillForm(user);

      submit();

      cy.wait('@failingRegister');
      cy.contains('[role="alert"]', es.registration.server.unexpected).should(
        'not.contain',
        'secreto interno',
      );
      field('schoolName').should('have.value', user.schoolName);
      field('email').should('have.value', user.email);
      field('password').should('have.value', '');
    });
  });

  describe('municipality list', () => {
    it('is served publicly and cacheable', () => {
      cy.request('/api/municipalities').then((response) => {
        expect(response.status).to.equal(200);
        expect(response.headers['cache-control']).to.equal('public, max-age=86400');
        const { data } = response.body as MunicipalitiesBody;
        expect(data).to.have.length(542);
        expect(data[0]).to.have.all.keys('code', 'name', 'province');
      });
    });

    it('offers a retry when it cannot be loaded and then recovers', () => {
      // La lista es cacheable un día: sin vaciar la caché del navegador, las visitas anteriores
      // la sirven desde disco y la simulación del fallo de red nunca llega a aplicarse.
      cy.wrap(
        Cypress.automation('remote:debugger:protocol', { command: 'Network.clearBrowserCache' }),
      );
      cy.intercept('GET', '/api/municipalities', { statusCode: 503, body: {} }).as('failing');
      cy.visit('/registro');
      cy.contains(es.registration.municipalities.loadError).should('be.visible');
      cy.get('button[type="submit"]').should('be.disabled');

      cy.intercept('GET', '/api/municipalities', (request) => {
        request.continue();
      }).as('recovered');
      cy.contains('button', es.registration.municipalities.retry).click();

      cy.wait('@recovered');
      field('municipalityCode').should('be.visible');
      cy.get('button[type="submit"]').should('be.enabled');
    });
  });
});
