import policy from '../../content-security-policy.json';
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

  ['/', '/registro', '/privacidad'].forEach((path) => {
    it(`${path} loads without violating the policy`, () => {
      const violations: string[] = [];
      cy.visit(path, { onBeforeLoad: (win) => recordViolations(win, violations) });
      cy.get('main, [data-testid]').should('exist');
      cy.then(() => {
        expect(violations, 'violaciones de la CSP').to.deep.equal([]);
      });
    });
  });
});
