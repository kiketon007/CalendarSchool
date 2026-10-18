const ORIGIN = 'http://localhost:4173';

/** Datos para registrar al administrador que genera la invitación. */
export interface InvitationAdmin {
  schoolName: string;
  municipalityCode: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface GeneratedInvitation {
  id: string;
  /** Token del enlace (el fragmento de `<origen>/invitacion#<token>`). */
  token: string;
  /** Access token del administrador, para poder revocar la invitación. */
  accessToken: string;
}

/**
 * Registra a un administrador y genera una invitación por la API, como haría la interfaz. Al
 * terminar borra las cookies: quien abre el enlace no tiene sesión.
 */
export function generateInvitation(
  admin: InvitationAdmin,
  role: 'ADMIN' | 'MEMBER' = 'MEMBER',
): Cypress.Chainable<GeneratedInvitation> {
  return cy
    .request({
      method: 'POST',
      url: '/api/auth/register',
      body: { ...admin, privacyPolicyAccepted: true, captcha: { version: 'v3', token: 'e2e' } },
    })
    .then(() =>
      cy.request({ method: 'POST', url: '/api/auth/refresh', headers: { Origin: ORIGIN } }),
    )
    .then((refreshed) => {
      const accessToken = (refreshed.body as { data: { session: { accessToken: string } } }).data
        .session.accessToken;
      return cy
        .request({
          method: 'POST',
          url: '/api/invitations',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { role },
        })
        .then((created) => {
          const data = (created.body as { data: { invitation: { id: string }; url: string } }).data;
          // Se encadena el borrado de cookies para no mezclar comandos de Cypress con un valor síncrono.
          return cy.clearCookies().then(() => ({
            id: data.invitation.id,
            token: data.url.slice(data.url.indexOf('#') + 1),
            accessToken,
          }));
        });
    });
}
