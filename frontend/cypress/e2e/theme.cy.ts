/** Colores del tema (frontend/src/styles/theme.scss) tal como los calcula el navegador. */
const PAGE_BACKGROUND = 'rgb(247, 248, 252)';
const TEXT = 'rgb(23, 35, 59)';
const BRAND = 'rgb(91, 91, 214)';
const WHITE = 'rgb(255, 255, 255)';

describe('Tema visual', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('colours the page with the brand palette', () => {
    cy.get('body').should('have.css', 'background-color', PAGE_BACKGROUND);
    cy.get('body').should('have.css', 'color', TEXT);
  });

  it('colours the primary button with the brand colour and white text', () => {
    cy.get('button[type="submit"]')
      .should('have.css', 'background-color', BRAND)
      .and('have.css', 'color', WHITE);
  });

  it('keeps the borders of the form fields perceptible', () => {
    cy.get('#login-email').should('have.css', 'border-top-color', 'rgb(134, 142, 159)');
  });

  it('does not scroll horizontally at 360 px', () => {
    cy.viewport(360, 740);
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth,
      );
    });
  });
});
