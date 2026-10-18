import policy from '../../content-security-policy.json';
import es from '../../src/i18n/es.json';
import { serializeContentSecurityPolicy } from '../../src/security/contentSecurityPolicy';

/** Registra las violaciones de la CSP que el navegador detecta mientras se carga la página. */
function recordViolations(win: Cypress.AUTWindow, violations: string[]) {
  win.document.addEventListener('securitypolicyviolation', (event) => {
    violations.push(`${event.violatedDirective} -> ${event.blockedURI}`);
  });
}

describe('Content-Security-Policy', () => {
  it('serves the policy as an enforced header, never as report-only', () => {
    cy.request('/').then((response) => {
      expect(response.headers['content-security-policy']).to.equal(
        serializeContentSecurityPolicy(policy),
      );
      expect(response.headers).not.to.have.property('content-security-policy-report-only');
    });
  });

  it('is enforced in the browser: an inline script is blocked and reported', () => {
    const violations: string[] = [];
    cy.visit('/registro', { onBeforeLoad: (win) => recordViolations(win, violations) });
    cy.window().then((win) => {
      const script = win.document.createElement('script');
      script.textContent = 'window.cspProbe = true';
      win.document.body.appendChild(script);
    });
    cy.window().its('cspProbe').should('be.undefined');
    // El navegador notifica la violación de forma asíncrona: la aserción se reintenta.
    cy.wrap(violations).should((reported) => {
      expect(reported.some((violation) => violation.startsWith('script-src'))).to.equal(true);
    });
  });

  ['/registro', '/login'].forEach((path) => {
    it(`serves the same policy with ${path}, the pages that use reCAPTCHA`, () => {
      cy.request(path).then((response) => {
        expect(response.headers['content-security-policy']).to.equal(
          serializeContentSecurityPolicy(policy),
        );
        expect(response.headers).not.to.have.property('content-security-policy-report-only');
      });
    });
  });

  ['/', '/registro', '/login', '/privacidad'].forEach((path) => {
    it(`${path} loads without violating the policy`, () => {
      const violations: string[] = [];
      cy.visit(path, { onBeforeLoad: (win) => recordViolations(win, violations) });
      cy.get('main, [data-testid]').should('exist');
      cy.then(() => {
        expect(violations, 'violaciones de la CSP').to.deep.equal([]);
      });
    });
  });

  it('completes a login and a logout, from the form to onboarding and back, without violating the policy', () => {
    const violations: string[] = [];
    const id = `csp${Date.now()}`;
    const user = {
      schoolName: `Colegio CSP ${id}`,
      email: `csp.${id}@example.com`,
      password: 'Secreta123!',
      municipalityCode: '46250',
      firstName: 'José María',
      lastName: 'García-López',
    };
    cy.request({
      method: 'POST',
      url: '/api/auth/register',
      body: { ...user, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
    });
    // Un miembro del colegio, para tener a quién darle de baja en la página de usuarios.
    const memberEmail = `miembro.${id}@example.com`;
    cy.task('createUser', {
      schoolEmail: user.email,
      email: memberEmail,
      password: user.password,
      role: 'MEMBER',
    });
    cy.clearCookies();

    cy.visit('/login', { onBeforeLoad: (win) => recordViolations(win, violations) });
    cy.get('#login-email').type(user.email);
    cy.get('#login-password').type(user.password);
    cy.get('button[type="submit"]').click();

    cy.location('pathname').should('equal', '/onboarding');
    cy.get('[data-testid="app-header"]').should('be.visible');
    // La página de usuarios (navegación y petición autenticada a la API) tampoco viola la CSP.
    cy.contains('a', es.header.users).click();
    cy.location('pathname').should('equal', '/usuarios');
    cy.get('[data-testid="users-page"] table[aria-labelledby="users-title"]').should('be.visible');
    // Las acciones de la gestión de usuarios: el diálogo de la baja y el aviso de un rechazo tampoco
    // violan la política (el modal de Bootstrap ajusta estilos con JavaScript, no con atributos).
    cy.contains('tr', memberEmail).contains('button', es.users.actions.suspend).click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"]').contains('button', es.users.confirmSuspend.cancel).click();
    cy.get('[role="dialog"]').should('not.exist');
    cy.contains('tr', user.email).contains('button', es.users.actions.makeMember).click();
    cy.contains('[role="alert"]', es.users.errors.lastAdminRequired).should('be.visible');
    // La sección de invitaciones y el panel con el enlace (generar y copiar) tampoco la violan.
    cy.contains('button', es.invitations.generate).click();
    cy.get('#invitation-link').should('be.visible');
    cy.contains('button', es.invitations.link.copy).click();
    cy.get('#invitation-link')
      .closest('[role="group"]')
      .find('[role="status"]')
      .should('be.visible');
    cy.contains('button', es.invitations.link.done).click();
    cy.get('#invitation-link').should('not.exist');
    cy.get('[data-testid="users-page"] table[aria-labelledby="invitations-title"]').should(
      'be.visible',
    );
    cy.contains('button', es.header.logout).click();
    cy.location('pathname').should('equal', '/login');
    cy.get('[data-testid="app-header"]').should('not.exist');
    cy.then(() => {
      expect(violations, 'violaciones de la CSP').to.deep.equal([]);
    });
  });
});
