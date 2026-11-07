import es from '../../src/i18n/es.json';
import { openUserMenu } from '../support/shell';

const PASSWORD = 'Secreta123!';
const APP_ORIGIN = 'http://localhost:4173';
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 360, height: 740 };

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}m${sequence}`;
  return {
    schoolName: `Colegio Marco ${id}`,
    email: `marco.${id}@example.com`,
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

/** Deja en el navegador la sesión de otro usuario del colegio del administrador. */
function loginAsMember(admin: TestAdmin) {
  const email = admin.email.replace('marco.', 'miembro.');
  cy.task('createUser', { schoolEmail: admin.email, email, password: PASSWORD, role: 'MEMBER' });
  cy.request({
    method: 'POST',
    url: '/api/auth/login',
    headers: { Origin: APP_ORIGIN },
    body: { email, password: PASSWORD, captcha: { version: 'v3', token: 'e2e' } },
  });
}

const sidebar = () => cy.get('[data-testid="app-sidebar"]');
const navigation = () => cy.get(`nav[aria-label="${es.header.navigation}"]`);
const openMenuButton = () => cy.get(`button[aria-label="${es.shell.openMenu}"]`);

const workspaceLabels = [
  es.shell.home,
  es.header.courses,
  es.header.professors,
  es.header.students,
  es.header.calendars,
  es.header.subjects,
  es.header.constraints,
  es.header.schedule,
];

describe('application frame', () => {
  describe('at 1280 px', () => {
    beforeEach(() => {
      cy.viewport(DESKTOP.width, DESKTOP.height);
    });

    it('shows the sidebar, always open, with the eight workspace links and Users to an administrator', () => {
      registerViaApi(uniqueAdmin());

      cy.visit('/onboarding');

      sidebar().should('be.visible');
      openMenuButton().should('not.be.visible');
      navigation()
        .find(`ul[aria-labelledby="shell-workspace"] a`)
        .then((links) => {
          expect([...links].map((link) => link.textContent)).to.deep.equal(workspaceLabels);
        });
      navigation().contains('p', es.shell.administration).should('be.visible');
      navigation()
        .find(`ul[aria-labelledby="shell-administration"] a`)
        .should('have.length', 1)
        .and('contain', es.header.users);
    });

    it('does not show the Administration group to a member', () => {
      const admin = uniqueAdmin();
      registerViaApi(admin);
      loginAsMember(admin);

      cy.visit('/onboarding');

      navigation().should('be.visible');
      navigation().should('not.contain', es.shell.administration);
      navigation().should('not.contain', es.header.users);
    });

    it('marks the section as the current page in its subroutes, and only that one', () => {
      registerViaApi(uniqueAdmin());

      cy.visit('/cursos/nuevo');

      navigation()
        .find('[aria-current="page"]')
        .should('have.length', 1)
        .and('contain', es.header.courses);
    });

    it('keeps the sidebar in place while the page scrolls', () => {
      registerViaApi(uniqueAdmin());
      cy.visit('/cursos/nuevo');

      cy.scrollTo('bottom', { ensureScrollable: false });

      sidebar().its('0').invoke('getBoundingClientRect').its('top').should('equal', 0);
    });

    it('does not scroll horizontally on the courses page', () => {
      registerViaApi(uniqueAdmin());
      cy.visit('/cursos');
      cy.contains('h1', es.courses.title);

      cy.document().then((document) => {
        expect(document.documentElement.scrollWidth).to.be.at.most(
          document.documentElement.clientWidth,
        );
      });
    });
  });

  describe('at 360 px', () => {
    beforeEach(() => {
      cy.viewport(MOBILE.width, MOBILE.height);
    });

    it('hides the sidebar and opens it as a panel with the focus inside, closing with Escape and giving the focus back', () => {
      registerViaApi(uniqueAdmin());
      cy.visit('/onboarding');
      sidebar().should('not.be.visible');

      openMenuButton().click();

      cy.get('[role="dialog"]').should('be.visible').and('have.attr', 'aria-label', es.shell.menu);
      cy.focused().closest('[role="dialog"]').should('exist');

      cy.get('body').type('{esc}');

      cy.get('[role="dialog"]').should('not.exist');
      openMenuButton().should('have.focus');
    });

    it('navigates from the panel and closes it', () => {
      registerViaApi(uniqueAdmin());
      cy.visit('/onboarding');
      openMenuButton().click();

      cy.get('[role="dialog"]').contains('a', es.header.professors).click();

      cy.location('pathname').should('equal', '/profesores');
      cy.get('[role="dialog"]').should('not.exist');
    });

    it('does not scroll horizontally with the panel closed or open', () => {
      registerViaApi(uniqueAdmin());
      cy.visit('/cursos');
      cy.contains('h1', es.courses.title);
      const assertNoHorizontalScroll = () =>
        cy.document().then((document) => {
          expect(document.documentElement.scrollWidth).to.be.at.most(
            document.documentElement.clientWidth,
          );
        });

      assertNoHorizontalScroll();
      openMenuButton().click();
      cy.get('[role="dialog"]').should('be.visible');
      assertNoHorizontalScroll();
    });
  });

  describe('user menu', () => {
    it('shows the name, the role and the school, and closes with Escape giving the focus back', () => {
      const admin = uniqueAdmin();
      registerViaApi(admin);
      cy.visit('/onboarding');

      openUserMenu();

      cy.get('[data-testid="app-header"]')
        .should('contain', `${admin.firstName} ${admin.lastName}`)
        .and('contain', es.shell.role.ADMIN)
        .and('contain', admin.schoolName);
      cy.get('body').type('{esc}');
      cy.get('[data-testid="user-menu-toggle"]')
        .should('have.attr', 'aria-expanded', 'false')
        .and('have.focus');
    });

    it('says Member for a member', () => {
      const admin = uniqueAdmin();
      registerViaApi(admin);
      loginAsMember(admin);
      cy.visit('/onboarding');

      openUserMenu();

      cy.get('[data-testid="app-header"]').should('contain', es.shell.role.MEMBER);
    });
  });

  describe('skip link', () => {
    it('appears with the keyboard focus and moves the focus to the content without changing the address', () => {
      registerViaApi(uniqueAdmin());
      cy.visit('/cursos');
      cy.contains('h1', es.courses.title);

      // Teclas reales del navegador: Tab desde el inicio de la página llega al enlace y Intro lo activa.
      cy.press(Cypress.Keyboard.Keys.TAB);
      cy.contains('a', es.shell.skipToContent).should('have.focus').and('be.visible');
      cy.press(Cypress.Keyboard.Keys.ENTER);

      cy.focused().should('have.attr', 'id', 'contenido');
      cy.location('pathname').should('equal', '/cursos');
      cy.location('hash').should('equal', '');
    });
  });
});
