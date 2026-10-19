const ORIGIN = 'http://localhost:4173';

/** Datos para registrar al administrador que genera el restablecimiento. */
export interface ResetAdmin {
  schoolName: string;
  municipalityCode: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface GeneratedReset {
  /** Identificador del usuario cuya contraseña se restablece. */
  userId: string;
  /** Email del miembro creado. */
  memberEmail: string;
  /** Access token del administrador, para poder generar otro enlace o revocarlo. */
  accessToken: string;
  /** Token del enlace (el fragmento de `<origen>/restablecer#<token>`). */
  token: string;
}

/** Genera (otra vez) el enlace de restablecimiento del usuario por la API y devuelve su token. */
export function generateResetToken(accessToken: string, userId: string): Cypress.Chainable<string> {
  return cy
    .request({
      method: 'POST',
      url: `/api/users/${userId}/password-reset`,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    .then((created) => {
      const url = (created.body as { data: { url: string } }).data.url;
      return url.slice(url.indexOf('#') + 1);
    });
}

/**
 * Registra a un administrador, crea un miembro en su colegio y genera su restablecimiento por la API,
 * como haría la interfaz. Al terminar borra las cookies: quien abre el enlace no tiene sesión.
 */
export function generateReset(
  admin: ResetAdmin,
  memberEmail: string,
): Cypress.Chainable<GeneratedReset> {
  return cy
    .request({
      method: 'POST',
      url: '/api/auth/register',
      body: { ...admin, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
    })
    .then(() =>
      cy.task('createUser', {
        schoolEmail: admin.email,
        email: memberEmail,
        password: admin.password,
        role: 'MEMBER',
      }),
    )
    .then(() =>
      cy.request({ method: 'POST', url: '/api/auth/refresh', headers: { Origin: ORIGIN } }),
    )
    .then((refreshed) => {
      const accessToken = (refreshed.body as { data: { session: { accessToken: string } } }).data
        .session.accessToken;
      return cy
        .request({ url: '/api/users', headers: { Authorization: `Bearer ${accessToken}` } })
        .then((listed) => {
          const users = (listed.body as { data: { id: string; email: string }[] }).data;
          const userId = users.find((user) => user.email === memberEmail)!.id;
          return generateResetToken(accessToken, userId).then((token) =>
            // Se encadena el borrado de cookies para no mezclar comandos de Cypress con un valor síncrono.
            cy.clearCookies().then(() => ({ userId, memberEmail, accessToken, token })),
          );
        });
    });
}
