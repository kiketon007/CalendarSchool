describe('home page', () => {
  it('loads without console errors', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        cy.spy(win.console, 'error').as('consoleError');
      },
    });

    cy.get('[data-testid="home-page"]').should('be.visible');
    cy.get('h1').should('not.be.empty');
    cy.get('@consoleError').should('not.have.been.called');
  });
});
