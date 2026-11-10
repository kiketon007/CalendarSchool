const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueUser() {
  sequence += 1;
  const id = `${runId}r${sequence}`;
  return {
    schoolName: `Colegio Raíz ${id}`,
    email: `raiz.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}

/** Alta directa por la API: deja la sesión de la persona en el navegador (la cookie de renovación). */
function registerViaApi(user: ReturnType<typeof uniqueUser>) {
  return cy.request({
    method: 'POST',
    url: '/api/auth/register',
    body: { ...user, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
  });
}

describe('the root path', () => {
  it('leads a visitor without a session to the login form, without console errors', () => {
    cy.clearCookies();

    cy.visit('/', {
      onBeforeLoad(win) {
        cy.spy(win.console, 'error').as('consoleError');
      },
    });

    cy.location('pathname').should('equal', '/login');
    cy.get('[data-testid="login-page"]').should('be.visible');
    cy.get('h1').should('not.be.empty');
    cy.get('[role="alert"]').should('not.exist');
    cy.get('@consoleError').should('not.have.been.called');
  });

  it('leads a person with a session to the welcome screen', () => {
    const user = uniqueUser();
    registerViaApi(user);

    cy.visit('/');

    cy.location('pathname').should('equal', '/onboarding');
    cy.get('[data-testid="onboarding-page"]').should('contain', user.schoolName);
  });

  it('does not leave the root in the history: going back from the login does not return to it', () => {
    cy.clearCookies();
    cy.visit('/privacidad');
    cy.get('[data-testid="privacy-policy-page"]').should('be.visible');

    cy.visit('/');
    cy.location('pathname').should('equal', '/login');

    cy.go('back');

    cy.location('pathname').should('equal', '/privacidad');
    cy.get('[data-testid="privacy-policy-page"]').should('be.visible');
  });
});
