import es from '../../src/i18n/es.json';
import { generateInvitation } from '../support/invitations';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}a${sequence}`;
  return {
    schoolName: `Colegio Aceptar ${id}`,
    email: `aceptar.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
    inviteeEmail: `invitada.${id}@example.com`,
  };
}
type TestAdmin = ReturnType<typeof uniqueAdmin>;

const texts = es.acceptInvitation;
const fill = (admin: TestAdmin, email = admin.inviteeEmail) => {
  cy.get('#invitation-firstName').type('Ana');
  cy.get('#invitation-lastName').type('Pérez-Gil');
  cy.get('#invitation-email').type(email);
  cy.get('#invitation-password').type(PASSWORD);
  cy.get('#invitation-privacyPolicyAccepted').check();
};

describe('accepting an invitation', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/invitations/lookup').as('lookup');
    cy.intercept('POST', '/api/invitations/accept').as('accept');
  });

  it('opens the link, creates the account, goes to the login with the notice and logs in as a member', () => {
    const admin = uniqueAdmin();
    generateInvitation(admin).then(({ token }) => {
      cy.visit(`/invitacion#${token}`);

      // El token sale de la barra de direcciones en cuanto se carga la página.
      cy.location('hash').should('equal', '');
      cy.location('pathname').should('equal', '/invitacion');
      cy.wait('@lookup').its('response.statusCode').should('equal', 200);
      cy.contains(`Te han invitado a ${admin.schoolName} como ${es.users.role.MEMBER}.`).should(
        'be.visible',
      );

      fill(admin);
      cy.contains('button', texts.submit).click();

      cy.wait('@accept').its('response.statusCode').should('equal', 201);
      cy.location('pathname').should('equal', '/login');
      cy.contains('[role="status"]', es.login.accountCreated).should('be.visible');
      cy.get('#login-email').should('have.value', admin.inviteeEmail);

      cy.get('#login-password').type(PASSWORD);
      cy.get('button[type="submit"]').click();
      cy.location('pathname').should('equal', '/onboarding');
      cy.get('[data-testid="app-header"]').should('be.visible');
      // Es un miembro: no ve la navegación de usuarios.
      cy.contains('a', es.header.users).should('not.exist');
    });
  });

  it('shows the invalid link view, with no form, to a revoked link', () => {
    const admin = uniqueAdmin();
    generateInvitation(admin).then(({ id, token, accessToken }) => {
      cy.request({
        method: 'POST',
        url: `/api/invitations/${id}/revoke`,
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .its('status')
        .should('equal', 204);

      cy.visit(`/invitacion#${token}`);

      cy.wait('@lookup').its('response.statusCode').should('equal', 410);
      cy.contains(texts.invalid).should('be.visible');
      cy.get('#invitation-firstName').should('not.exist');
    });
  });

  it('shows the invalid link view without calling the server when the link has no token', () => {
    cy.visit('/invitacion');

    cy.contains(texts.invalid).should('be.visible');
    cy.get('#invitation-firstName').should('not.exist');
  });

  it('shows the error in the email field when the email is already registered', () => {
    const admin = uniqueAdmin();
    generateInvitation(admin).then(({ token }) => {
      cy.visit(`/invitacion#${token}`);
      cy.wait('@lookup');

      fill(admin, admin.email);
      cy.contains('button', texts.submit).click();

      cy.wait('@accept').its('response.statusCode').should('equal', 409);
      cy.contains('[role="alert"]', es.registration.server.emailAlreadyRegistered).should(
        'be.visible',
      );
      cy.location('pathname').should('equal', '/invitacion');
      cy.get('#invitation-firstName').should('have.value', 'Ana');
    });
  });
});
