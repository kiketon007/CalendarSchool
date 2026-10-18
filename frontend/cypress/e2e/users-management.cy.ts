import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';
const ORIGIN = 'http://localhost:4173';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}g${sequence}`;
  return {
    schoolName: `Colegio Gestion ${id}`,
    email: `gestion.${id}@example.com`,
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

/** Crea otro usuario en el colegio del administrador (las invitaciones llegan con US02_b4). */
function createSchoolUser(admin: TestAdmin, prefix: string, role: 'ADMIN' | 'MEMBER') {
  const email = admin.email.replace('gestion.', `${prefix}.`);
  return cy
    .task('createUser', { schoolEmail: admin.email, email, password: PASSWORD, role })
    .then(() => email);
}

const rowOf = (email: string) =>
  cy.contains('[data-testid="users-page"] table[aria-labelledby="users-title"] tbody tr', email);
const usersLink = () => cy.contains('a', es.header.users);
const texts = es.users;

describe('school users management', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/users').as('listUsers');
    cy.intercept('PUT', '/api/users/*/role').as('changeRole');
    cy.intercept('POST', '/api/users/*/suspend').as('suspend');
    cy.intercept('POST', '/api/users/*/reactivate').as('reactivate');
  });

  it('promotes a member to administrator from the users page', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createSchoolUser(admin, 'miembro', 'MEMBER').then((memberEmail) => {
      cy.visit('/usuarios');
      cy.wait('@listUsers');

      rowOf(memberEmail).contains('button', texts.actions.makeAdmin).click();

      cy.wait('@changeRole').its('response.statusCode').should('equal', 200);
      rowOf(memberEmail)
        .should('contain', texts.role.ADMIN)
        .and('contain', texts.actions.makeMember);
      cy.get('[role="alert"]').should('not.exist');
    });
  });

  it('suspends a member after confirming, blocks their login, reactivates them and lets them in again', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createSchoolUser(admin, 'miembro', 'MEMBER').then((memberEmail) => {
      cy.visit('/usuarios');
      cy.wait('@listUsers');

      // Cancelar no envía nada.
      rowOf(memberEmail).contains('button', texts.actions.suspend).click();
      cy.get('[role="dialog"]').should('contain', 'Miembro Prueba');
      cy.get('[role="dialog"]').contains('button', texts.confirmSuspend.cancel).click();
      cy.get('[role="dialog"]').should('not.exist');
      rowOf(memberEmail).should('contain', texts.status.ACTIVE);

      // Confirmar da de baja.
      rowOf(memberEmail).contains('button', texts.actions.suspend).click();
      cy.get('[role="dialog"]').contains('button', texts.confirmSuspend.confirm).click();
      cy.wait('@suspend').its('response.statusCode').should('equal', 200);
      cy.get('[role="dialog"]').should('not.exist');
      rowOf(memberEmail)
        .should('contain', texts.status.SUSPENDED)
        .within(() => {
          cy.get('button').should('have.length', 1).and('contain', texts.actions.reactivate);
        });

      // La cuenta dada de baja no inicia sesión (por la API: un 403 no fija ninguna cookie).
      cy.request({
        method: 'POST',
        url: '/api/auth/login',
        failOnStatusCode: false,
        headers: { Origin: ORIGIN },
        body: { email: memberEmail, password: PASSWORD, captcha: { version: 'v3', token: 'e2e' } },
      }).then((response) => {
        expect(response.status).to.equal(403);
        expect((response.body as { error: { code: string } }).error.code).to.equal(
          'ACCOUNT_SUSPENDED',
        );
      });

      // Reactivar devuelve la cuenta a su estado y rol.
      rowOf(memberEmail).contains('button', texts.actions.reactivate).click();
      cy.wait('@reactivate').its('response.statusCode').should('equal', 200);
      rowOf(memberEmail).should('contain', texts.status.ACTIVE).and('contain', texts.role.MEMBER);

      // Y el miembro vuelve a entrar con su contraseña de antes.
      cy.clearCookies();
      cy.visit('/login');
      cy.get('#login-email').type(memberEmail);
      cy.get('#login-password').type(PASSWORD);
      cy.get('button[type="submit"]').click();
      cy.location('pathname').should('equal', '/onboarding');
    });
  });

  it('does not let the only administrator make themselves a member', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    cy.visit('/usuarios');
    cy.wait('@listUsers');

    rowOf(admin.email).should('contain', texts.you);
    rowOf(admin.email).contains('button', texts.actions.suspend).should('not.exist');
    rowOf(admin.email).contains('button', texts.actions.makeMember).click();

    cy.wait('@changeRole').its('response.statusCode').should('equal', 409);
    cy.contains('[role="alert"]', texts.errors.lastAdminRequired).should('be.visible');
    rowOf(admin.email).should('contain', texts.role.ADMIN);
    cy.location('pathname').should('equal', '/usuarios');
  });

  it('takes an administrator to onboarding when they make themselves a member and another administrator stays', () => {
    const admin = uniqueAdmin();
    registerViaApi(admin);
    createSchoolUser(admin, 'otro', 'ADMIN').then(() => {
      cy.visit('/usuarios');
      cy.wait('@listUsers');

      rowOf(admin.email).contains('button', texts.actions.makeMember).click();

      cy.wait('@changeRole').its('response.statusCode').should('equal', 200);
      cy.location('pathname').should('equal', '/onboarding');
      usersLink().should('not.exist');
    });
  });
});
