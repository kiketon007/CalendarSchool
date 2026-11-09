import es from '../../src/i18n/es.json';

const PASSWORD = 'Secreta123!';

/** Cada ejecución del E2E parte de una base vacía; los datos únicos evitan choques entre tests. */
const runId = Date.now();
let sequence = 0;
function uniqueAdmin() {
  sequence += 1;
  const id = `${runId}g${sequence}`;
  return {
    schoolName: `Colegio Generacion ${id}`,
    email: `generacion.${id}@example.com`,
    password: PASSWORD,
    municipalityCode: '46250',
    firstName: 'José María',
    lastName: 'García-López',
  };
}
type TestAdmin = ReturnType<typeof uniqueAdmin>;

const texts = es.schedule.generation;
const scoreTexts = es.schedule.score;
const SUMMARY = 'Horario borrador generado: 3 sesiones colocadas';

function registerViaApi(admin: TestAdmin) {
  return cy.request({
    method: 'POST',
    url: '/api/auth/register',
    body: { ...admin, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
  });
}

/** Da el access token de la sesión del navegador (el `refresh` lo emite con la cookie). */
function withAccessToken(use: (accessToken: string) => void) {
  cy.request({
    method: 'POST',
    url: '/api/auth/refresh',
    headers: { Origin: 'http://localhost:4173' },
  }).then((refreshed) => {
    use(
      (refreshed.body as { data: { session: { accessToken: string } } }).data.session.accessToken,
    );
  });
}

/** Una petición autenticada por la API que debe responder `200` o `201`. */
function callApi(method: 'POST' | 'PUT', url: string, body: object, use?: (body: unknown) => void) {
  withAccessToken((accessToken) => {
    cy.request({ method, url, headers: { Authorization: `Bearer ${accessToken}` }, body }).then(
      (response) => {
        expect(response.status).to.be.oneOf([200, 201]);
        use?.(response.body);
      },
    );
  });
}

/** Tres sesiones de 60 min: 15 a la semana. */
const PERIODS = [
  { type: 'SESSION', startTime: '09:00', endTime: '10:00' },
  { type: 'SESSION', startTime: '10:00', endTime: '11:00' },
  { type: 'SESSION', startTime: '11:00', endTime: '12:00' },
];

/** Un colegio listo para generar: un curso con calendario y una asignatura de 3 sesiones con su profesor. */
function seedReadySchool(admin: TestAdmin, options: { preferred?: boolean } = {}) {
  registerViaApi(admin);
  const ids = { courseId: '', classId: '', subjectId: '', professorId: '' };
  callApi('POST', '/api/courses', { name: '1º Primaria', classes: [{ name: 'A' }] }, (body) => {
    const course = (body as { data: { course: { id: string; classes: { id: string }[] } } }).data
      .course;
    ids.courseId = course.id;
    ids.classId = course.classes[0]?.id ?? '';
  });
  cy.then(() => {
    callApi('POST', '/api/calendars', {
      name: 'Corto',
      periods: PERIODS,
      courseIds: [ids.courseId],
    });
    callApi(
      'POST',
      '/api/subjects',
      {
        name: 'Lengua',
        type: 'CORE',
        status: 'ACTIVE',
        color: 'blue',
        courses: [{ courseId: ids.courseId, sessionsPerWeek: 3 }],
      },
      (body) => {
        ids.subjectId = (body as { data: { subject: { id: string } } }).data.subject.id;
      },
    );
    callApi('POST', '/api/professors', { firstName: 'Ana', lastName: 'García' }, (body) => {
      ids.professorId = (body as { data: { professor: { id: string } } }).data.professor.id;
    });
  });
  cy.then(() => {
    callApi('PUT', `/api/courses/${ids.courseId}/assignments`, {
      assignments: [
        { subjectId: ids.subjectId, classId: ids.classId, professorId: ids.professorId },
      ],
    });
  });
  if (options.preferred === true) {
    // La última sesión de lunes, miércoles y viernes: la mejora tiene dónde ganar.
    cy.then(() => {
      callApi('PUT', `/api/courses/${ids.courseId}/subjects/${ids.subjectId}/preferred-slots`, {
        slots: [
          { dayOfWeek: 1, sessionNumber: 3 },
          { dayOfWeek: 3, sessionNumber: 3 },
          { dayOfWeek: 5, sessionNumber: 3 },
        ],
      });
    });
  }
}

/** La página no se desplaza en horizontal. */
function expectNoHorizontalScroll() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(
      document.documentElement.clientWidth,
    );
  });
}

const panel = () => cy.get('[data-testid="schedule-generation-panel"]');

function openSchedules() {
  cy.visit('/horarios');
  cy.wait('@getReadiness');
  panel().should('be.visible');
}

function loginAsMember(admin: TestAdmin) {
  const memberEmail = admin.email.replace('generacion.', 'miembro.');
  cy.task('createUser', {
    schoolEmail: admin.email,
    email: memberEmail,
    password: PASSWORD,
    role: 'MEMBER',
  });
  cy.clearCookies();
  cy.visit('/login');
  cy.get('#login-email').type(memberEmail);
  cy.get('#login-password').type(PASSWORD);
  cy.get('button[type="submit"]').click();
  cy.location('pathname').should('equal', '/onboarding');
}

describe('Generación de horarios', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/schedule/readiness').as('getReadiness');
  });

  it('lets an administrator generate and keeps showing the summary after a reload', () => {
    seedReadySchool(uniqueAdmin());
    openSchedules();
    panel().contains('button', texts.generate).should('be.enabled');

    panel().contains('button', texts.generate).click();

    panel().contains(SUMMARY).should('be.visible');
    panel().contains(texts.completedNote).should('be.visible');
    panel().contains('button', texts.generateAgain).should('be.enabled');
    panel().contains('button', texts.cancel).should('not.exist');

    cy.reload();
    cy.wait('@getReadiness');
    panel().contains(SUMMARY).should('be.visible');
  });

  it('shows the badge, the callout and the three figure cards that repeat the breakdown', () => {
    seedReadySchool(uniqueAdmin());
    openSchedules();
    panel().find('.cs-status-badge').should('not.exist');

    panel().contains('button', texts.generate).click();

    panel().contains(SUMMARY).should('be.visible');
    panel().find('.cs-eyebrow').should('have.text', texts.eyebrow.last);
    panel().find('.cs-status-badge').should('contain.text', texts.badge.draft);
    panel().find('.cs-highlight').should('be.visible');
    panel()
      .find('.cs-callout')
      .within(() => {
        cy.contains('a', texts.viewDraft).should('be.visible');
        cy.contains('button', es.schedule.confirm.button).should('be.visible');
      });
    cy.get('.cs-stat-card').should('have.length', 3);
    cy.contains('.cs-stat-label', es.schedule.score.stats.gaps).should('exist');
    cy.contains('dt', scoreTexts.gaps.label)
      .next('dd')
      .invoke('text')
      .then((gaps) => {
        cy.get('.cs-stat-card').eq(0).find('.cs-stat-value').should('have.text', gaps);
      });
    cy.contains('dt', scoreTexts.penalty.label)
      .next('dd')
      .find('strong')
      .invoke('text')
      .then((penalty) => {
        cy.get('.cs-stat-card').eq(2).find('.cs-stat-value').should('have.text', penalty);
      });
    cy.get('.cs-stat-card').first().closest('[aria-hidden="true"]').should('exist');
  });

  it('puts the figure cards in a row at 1280 px, without horizontal scroll', () => {
    cy.viewport(1280, 800);
    seedReadySchool(uniqueAdmin());
    openSchedules();

    panel().contains('button', texts.generate).click();

    panel().contains(SUMMARY).should('be.visible');
    cy.get('.cs-stat-card').should('have.length', 3);
    cy.get('.cs-stat-card').then(($cards) => {
      const tops = [...$cards].map((card) => Math.round(card.getBoundingClientRect().top));
      expect(new Set(tops).size).to.equal(1);
    });
    expectNoHorizontalScroll();
  });

  it('generates again and replaces the previous draft', () => {
    seedReadySchool(uniqueAdmin());
    openSchedules();
    panel().contains('button', texts.generate).click();
    panel().contains(SUMMARY).should('be.visible');
    let firstDraft = '';
    withAccessToken((accessToken) => {
      cy.request({
        url: '/api/schedule/generate',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((response) => {
        firstDraft = (response.body as { data: { generation: { scheduleId: string } } }).data
          .generation.scheduleId;
      });
    });

    panel().contains('button', texts.generateAgain).click();

    panel().contains(SUMMARY).should('be.visible');
    withAccessToken((accessToken) => {
      cy.request({
        url: '/api/schedule/generate',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((response) => {
        const second = (response.body as { data: { generation: { scheduleId: string } } }).data
          .generation.scheduleId;
        expect(second).to.not.equal(firstDraft);
      });
    });
  });

  it('shows the progress of a generation in progress after a reload and follows it to the end', () => {
    seedReadySchool(uniqueAdmin());
    const generation = {
      id: '0192f5a0-0000-7000-8000-0000000000f1',
      status: 'RUNNING',
      progress: 40,
      placed: 20,
      total: 50,
      improve: true,
      phase: 'SEARCHING',
      score: null,
      improvementCancelled: false,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
      scheduleId: null,
      createdAt: '2026-11-04T08:00:00.000Z',
      startedAt: '2026-11-04T08:00:01.000Z',
      finishedAt: null,
    };
    // El lanzador en memoria termina en milisegundos: para ver el progreso, el servidor simulado lo alarga.
    cy.intercept('GET', '/api/schedule/generate', {
      body: { success: true, data: { generation } },
    });
    cy.intercept('GET', `/api/schedule/generate/${generation.id}`, {
      body: {
        success: true,
        data: {
          generation: {
            ...generation,
            status: 'COMPLETED',
            progress: 100,
            placed: 50,
            scheduleId: '0192f5a0-0000-7000-8000-0000000000a2',
            finishedAt: '2026-11-04T08:00:05.000Z',
          },
        },
      },
    }).as('poll');

    openSchedules();

    panel().contains(texts.searching).should('be.visible');
    panel().contains('20 de 50 sesiones').should('be.visible');
    panel()
      .find('[role="progressbar"]')
      .should('have.attr', 'aria-valuenow', '40')
      .and('have.attr', 'aria-label', texts.progress.label);
    panel().contains('button', texts.cancel).should('be.enabled');
    panel().contains('button', texts.generate).should('be.disabled');

    cy.wait('@poll', { timeout: 8000 });
    panel().contains('Horario borrador generado: 50 sesiones colocadas').should('be.visible');
    panel().find('[role="progressbar"]').should('not.exist');
  });

  it('offers no button and explains why when something blocks the generation', () => {
    registerViaApi(uniqueAdmin());
    openSchedules();

    cy.contains('[data-testid="schedule-readiness-verdict"]', 'No se puede generar todavía');
    panel().contains(texts.blocked).should('be.visible');
    panel().contains('button', texts.generate).should('not.exist');
  });

  it('shows a member the state without any button', () => {
    const admin = uniqueAdmin();
    seedReadySchool(admin);
    openSchedules();
    panel().contains('button', texts.generate).click();
    panel().contains(SUMMARY).should('be.visible');

    loginAsMember(admin);
    openSchedules();

    panel().contains(SUMMARY).should('be.visible');
    panel().find('button').should('not.exist');
    panel().find('input[type="checkbox"]').should('not.exist');
  });

  it('tells a member that only administrators generate when nothing was generated', () => {
    const admin = uniqueAdmin();
    seedReadySchool(admin);

    loginAsMember(admin);
    openSchedules();

    panel().contains(texts.adminsOnly).should('be.visible');
    panel().find('button').should('not.exist');
  });

  it('is usable at 360 px without horizontal scroll', () => {
    cy.viewport(360, 740);
    seedReadySchool(uniqueAdmin());
    openSchedules();
    expectNoHorizontalScroll();

    panel().contains('button', texts.generate).click();

    panel().contains(SUMMARY).should('be.visible');
    panel().contains('button', texts.generateAgain).should('be.visible');
    cy.get('.cs-stat-card').should('have.length', 3);
    cy.get('.cs-stat-card').then(($cards) => {
      const tops = [...$cards].map((card) => Math.round(card.getBoundingClientRect().top));
      expect(new Set(tops).size).to.equal(3);
    });
    expectNoHorizontalScroll();
  });

  describe('mejorar con las preferencias', () => {
    const checkbox = () => panel().find('#schedule-improve');
    const breakdown = () => cy.get(`section[aria-label="${scoreTexts.title}"]`);

    it('improves by default, shows the breakdown in the summary, in the draft and in the official schedule', () => {
      seedReadySchool(uniqueAdmin(), { preferred: true });
      openSchedules();
      checkbox().should('be.checked');
      panel().contains(texts.improve.help).should('be.visible');

      panel().contains('button', texts.generate).click();

      panel().contains(SUMMARY).should('be.visible');
      breakdown().should('be.visible').and('contain', scoreTexts.preferred.label);
      breakdown().contains('antes de mejorar: 32').should('be.visible');
      panel().contains(texts.notImproved).should('not.exist');

      panel().contains('a', texts.viewDraft).click();
      cy.location('pathname').should('equal', '/horarios/borrador');
      breakdown().should('be.visible').and('contain', scoreTexts.gaps.label);
      cy.contains('button', es.schedule.confirm.button).click();
      cy.get('[role="dialog"]').contains('button', es.schedule.confirm.confirm).click();

      cy.location('pathname').should('equal', '/horarios/oficial');
      breakdown().should('be.visible').and('contain', scoreTexts.penalty.label);
      cy.reload();
      breakdown().should('be.visible');
    });

    it('generates without improving when the checkbox is unchecked', () => {
      seedReadySchool(uniqueAdmin(), { preferred: true });
      openSchedules();

      checkbox().uncheck();
      panel().contains('button', texts.generate).click();

      panel().contains(SUMMARY).should('be.visible');
      panel().contains(texts.notImproved).should('be.visible');
      // Sin mejorar la penalización es la del primer horario: nada de «antes de mejorar».
      breakdown().should('not.contain', 'antes de mejorar');
      checkbox().should('not.be.checked').and('be.enabled');
    });

    it('is usable at 360 px without horizontal scroll', () => {
      cy.viewport(360, 740);
      seedReadySchool(uniqueAdmin(), { preferred: true });
      openSchedules();
      checkbox().should('be.visible');
      expectNoHorizontalScroll();

      panel().contains('button', texts.generate).click();

      panel().contains(SUMMARY).should('be.visible');
      breakdown().should('be.visible');
      expectNoHorizontalScroll();
    });
  });
});
