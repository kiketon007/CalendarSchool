import es from '../../src/i18n/es.json';
import { generateReset, generateResetToken } from '../support/passwordReset';

const PASSWORD = 'Secreta123!';
const NEW_PASSWORD = 'Nueva4567!x';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}r${sequence}`;
  return {
    schoolName: `Colegio Restablecer ${id}`,
    email: `restablecer.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
    memberEmail: `miembro.${id}@example.com`,
  };
}
type TestAdmin = ReturnType<typeof uniqueAdmin>;

const texts = es.passwordReset;
const userTexts = es.users;
const rowOf = (email: string) =>
  cy.contains('[data-testid="users-page"] table[aria-labelledby="users-title"] tbody tr', email);

/** La fila de un usuario tiene siempre la marca de «pendiente» o no la tiene. */
const pendingBadge = (email: string) => rowOf(email).contains(userTexts.passwordReset.pending);

function logIn(email: string, password: string) {
  cy.get('#login-email').clear();
  cy.get('#login-email').type(email);
  cy.get('#login-password').clear();
  cy.get('#login-password').type(password);
  cy.get('button[type="submit"]').click();
}

describe('password reset', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/users').as('listUsers');
    cy.intercept('POST', '/api/users/*/password-reset').as('generate');
    cy.intercept('POST', '/api/users/*/password-reset/revoke').as('revoke');
    cy.intercept('POST', '/api/password-resets/lookup').as('lookup');
    cy.intercept('POST', '/api/password-resets/confirm').as('confirm');
  });

  it('lets the administrator generate the link, the member open it, set a new password and log in with it', () => {
    const admin = uniqueAdmin();
    cy.request({
      method: 'POST',
      url: '/api/auth/register',
      body: { ...admin, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
    });
    cy.task('createUser', {
      schoolEmail: admin.email,
      email: admin.memberEmail,
      password: PASSWORD,
      role: 'MEMBER',
    });

    cy.visit('/usuarios', {
      onBeforeLoad: (win) => {
        // El portapapeles real pide permisos en el navegador de Cypress: se simula la escritura.
        cy.stub(win.navigator.clipboard, 'writeText').as('writeText').resolves();
      },
    });
    cy.wait('@listUsers');
    rowOf(admin.memberEmail).contains('button', userTexts.passwordReset.action).click();
    cy.wait('@generate').its('response.statusCode').should('equal', 201);

    // El enlace aparece una vez, con su aviso, y la fila queda marcada sin volver a pedir la lista.
    cy.contains(userTexts.passwordReset.link.warning).should('be.visible');
    pendingBadge(admin.memberEmail).should('be.visible');
    cy.contains('button', es.invitations.link.copy).click();
    cy.get('@writeText').should('have.been.calledOnce');
    cy.get('#password-reset-link')
      .invoke('val')
      .then((url) => {
        const link = String(url);
        expect(link).to.contain('/restablecer#');
        const token = link.slice(link.indexOf('#') + 1);

        // Quien abre el enlace no tiene sesión.
        cy.clearCookies();
        cy.visit(`/restablecer#${token}`);

        // El token sale de la barra de direcciones en cuanto se carga la página.
        cy.location('hash').should('equal', '');
        cy.location('pathname').should('equal', '/restablecer');
        cy.wait('@lookup').its('response.statusCode').should('equal', 200);
        cy.contains(`la cuenta m***@example.com de ${admin.schoolName}`).should('be.visible');

        cy.get('#password-reset-password').type(NEW_PASSWORD);
        cy.get('#password-reset-confirm').type(NEW_PASSWORD);
        cy.get('button[type="submit"]').click();

        cy.wait('@confirm').its('response.statusCode').should('equal', 204);
        cy.location('pathname').should('equal', '/login');
        cy.contains('[role="status"]', es.login.passwordChanged).should('be.visible');

        // La contraseña anterior ya no sirve; la nueva, sí.
        logIn(admin.memberEmail, PASSWORD);
        cy.contains('[role="alert"]', es.login.server.invalidCredentials).should('be.visible');
        logIn(admin.memberEmail, NEW_PASSWORD);
        cy.location('pathname').should('equal', '/onboarding');
        cy.get('[data-testid="app-header"]').should('be.visible');
      });
  });

  it('revokes the link from the users page', () => {
    const admin = uniqueAdmin();
    generateReset(admin, admin.memberEmail).then(({ token }) => {
      // El administrador vuelve a entrar y ve la fila marcada, aunque el enlace se generó por la API.
      cy.visit('/login');
      logIn(admin.email, PASSWORD);
      cy.location('pathname').should('equal', '/onboarding');
      cy.contains('a', es.header.users).click();
      cy.wait('@listUsers');
      pendingBadge(admin.memberEmail).should('be.visible');

      rowOf(admin.memberEmail).contains('button', userTexts.passwordReset.revoke).click();
      cy.wait('@revoke').its('response.statusCode').should('equal', 204);
      rowOf(admin.memberEmail).contains(userTexts.passwordReset.pending).should('not.exist');

      cy.clearCookies();
      cy.visit(`/restablecer#${token}`);
      cy.wait('@lookup').its('response.statusCode').should('equal', 410);
      cy.contains(texts.invalid).should('be.visible');
    });
  });

  it('shows the invalid link view to a link replaced by another one', () => {
    const admin = uniqueAdmin();
    generateReset(admin, admin.memberEmail).then(({ accessToken, userId, token: replaced }) => {
      generateResetToken(accessToken, userId).then((current) => {
        cy.visit(`/restablecer#${replaced}`);
        cy.wait('@lookup').its('response.statusCode').should('equal', 410);
        cy.contains(texts.invalid).should('be.visible');
        cy.get('#password-reset-password').should('not.exist');

        // El enlace vigente sí funciona. Se pasa antes por otra página: visitar la misma ruta solo
        // con otro fragmento no recarga la aplicación.
        cy.visit('/');
        cy.visit(`/restablecer#${current}`);
        cy.wait('@lookup').its('response.statusCode').should('equal', 200);
        cy.get('#password-reset-password').should('be.visible');
      });
    });
  });

  it('shows the invalid link view, with no form, to a link without token', () => {
    cy.visit('/restablecer');

    cy.contains(texts.invalid).should('be.visible');
    cy.get('#password-reset-password').should('not.exist');
  });

  it('says that the passwords do not match and sends nothing', () => {
    const admin: TestAdmin = uniqueAdmin();
    generateReset(admin, admin.memberEmail).then(({ token }) => {
      cy.visit(`/restablecer#${token}`);
      cy.wait('@lookup');

      cy.get('#password-reset-password').type(NEW_PASSWORD);
      cy.get('#password-reset-confirm').type('Otra98765!z');
      cy.get('button[type="submit"]').click();

      cy.contains(texts.mismatch).should('be.visible');
      cy.location('pathname').should('equal', '/restablecer');
    });
  });
});
