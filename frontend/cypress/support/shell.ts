import es from '../../src/i18n/es.json';

/** Abre el menú de usuario de la cabecera (donde están el rol, el colegio y «Cerrar sesión»). */
export function openUserMenu() {
  cy.get('[data-testid="user-menu-toggle"]').click();
}

/** Cierra la sesión desde el menú de usuario. */
export function logOutFromMenu() {
  openUserMenu();
  cy.contains('button', es.header.logout).click();
}

/** Abre el panel de navegación (solo existe por debajo de 992 px; desde ahí la barra está siempre visible). */
export function openNavigationPanel() {
  cy.get(`button[aria-label="${es.shell.openMenu}"]`).click();
}
