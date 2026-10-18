import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';
const ORIGIN = 'http://localhost:4173';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}i${sequence}`;
  return {
    schoolName: `Colegio Invitaciones ${id}`,
    email: `invitaciones.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}

/** Alta directa por la API: deja la sesión del administrador en el navegador. */
function registerViaApi(admin: ReturnType<typeof uniqueAdmin>) {
  return cy.request({
    method: 'POST',
    url: '/api/auth/register',
    body: { ...admin, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
  });
}

const texts = es.invitations;
const section = () => cy.get('[data-testid="users-page"]').find('section');
const invitationRows = () =>
  cy.get('[data-testid="users-page"] table[aria-labelledby="invitations-title"] tbody tr');
const generateButton = () => cy.contains('button', texts.generate);

describe('school invitations', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/invitations').as('listInvitations');
    cy.intercept('POST', '/api/invitations').as('createInvitation');
    cy.intercept('POST', '/api/invitations/*/revoke').as('revokeInvitation');
  });

  it('generates, copies, lists and revokes invitations', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/usuarios', {
      onBeforeLoad: (win) => {
        // El portapapeles real pide permisos en el navegador de Cypress: se simula la escritura.
        cy.stub(win.navigator.clipboard, 'writeText').as('writeText').resolves();
      },
    });
    cy.wait('@listInvitations').its('response.statusCode').should('equal', 200);
    section().contains(texts.empty).should('be.visible');

    // Una invitación de miembro (el rol por defecto): el enlace aparece una vez, con su aviso.
    generateButton().click();
    cy.wait('@createInvitation').its('response.statusCode').should('equal', 201);
    cy.contains(texts.link.warning).should('be.visible');
    cy.get('#invitation-link')
      .invoke('val')
      .then((url) => {
        expect(url).to.match(new RegExp(`^${ORIGIN}/invitacion#.+`));
        cy.contains('button', texts.link.copy).click();
        cy.get('@writeText').should('have.been.calledOnceWith', url);
      });
    cy.contains('[role="status"]', texts.link.copied).should('be.visible');
    cy.contains('button', texts.link.done).click();
    cy.get('#invitation-link').should('not.exist');
    invitationRows().should('have.length', 1);

    // Tras recargar, la invitación sigue en la lista pero el enlace ya no se puede ver.
    cy.reload();
    cy.wait('@listInvitations');
    invitationRows().should('have.length', 1).and('contain', es.users.role.MEMBER);
    cy.get('#invitation-link').should('not.exist');
    cy.get('body').should('not.contain.text', 'invitacion#');

    // Otra de administrador: la más reciente va la primera.
    cy.get('#invitation-role').select('ADMIN');
    generateButton().click();
    cy.wait('@createInvitation').its('response.statusCode').should('equal', 201);
    cy.contains('button', texts.link.done).click();
    invitationRows().should('have.length', 2);
    invitationRows().first().should('contain', es.users.role.ADMIN);

    // Revocar la de miembro la quita de la lista, también tras recargar.
    invitationRows()
      .contains(es.users.role.MEMBER)
      .parents('tr')
      .contains('button', texts.revoke)
      .click();
    cy.wait('@revokeInvitation').its('response.statusCode').should('equal', 204);
    invitationRows().should('have.length', 1).and('contain', es.users.role.ADMIN);
    cy.reload();
    cy.wait('@listInvitations');
    invitationRows().should('have.length', 1).and('contain', es.users.role.ADMIN);
  });

  it('shows a notice and no link when the invitation cannot be generated', () => {
    registerViaApi(uniqueAdmin());
    cy.visit('/usuarios');
    cy.wait('@listInvitations');
    cy.intercept(
      { method: 'POST', url: '/api/invitations', times: 1 },
      {
        statusCode: 503,
        body: {
          success: false,
          error: { code: 'DATABASE_UNAVAILABLE', message: 'La base de datos no está disponible' },
        },
      },
    ).as('failingCreate');

    generateButton().click();

    cy.wait('@failingCreate');
    cy.contains('[role="alert"]', texts.errors.createUnavailable).should('be.visible');
    cy.get('#invitation-link').should('not.exist');
    invitationRows().should('not.exist');
  });
});
