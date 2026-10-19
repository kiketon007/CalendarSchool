import type { AppDependencies } from '../../src/app.js';

/** Origen de la aplicación en los tests: el único que acepta `POST /api/auth/refresh`. */
export const TEST_APP_ORIGIN = 'http://localhost:5173';

/**
 * Dependencias de `createApp` que un test no usa. Los casos de uso fallan con un error claro si
 * la petición llegara a ejecutarlos, en lugar de devolver datos inventados.
 */
export const defaultDependencies: Pick<
  AppDependencies,
  | 'limitRegistrationAttempts'
  | 'registerSchool'
  | 'refreshSession'
  | 'logIn'
  | 'logOut'
  | 'listMunicipalities'
  | 'authenticateRequest'
  | 'listSchoolUsers'
  | 'manageSchoolUser'
  | 'createInvitation'
  | 'listPendingInvitations'
  | 'revokeInvitation'
  | 'lookupInvitation'
  | 'acceptInvitation'
  | 'createPasswordReset'
  | 'revokePasswordReset'
  | 'lookupPasswordReset'
  | 'confirmPasswordReset'
  | 'appOrigin'
> = {
  // El límite no se aplica salvo que un test lo pida: deja pasar todos los intentos.
  limitRegistrationAttempts: { execute: () => Promise.resolve() },
  registerSchool: {
    execute: () => Promise.reject(new Error('registerSchool no debería llamarse')),
  },
  refreshSession: {
    execute: () => Promise.reject(new Error('refreshSession no debería llamarse')),
  },
  logIn: {
    execute: () => Promise.reject(new Error('logIn no debería llamarse')),
  },
  logOut: {
    execute: () => Promise.reject(new Error('logOut no debería llamarse')),
  },
  listMunicipalities: {
    execute: () => Promise.reject(new Error('listMunicipalities no debería llamarse')),
  },
  authenticateRequest: {
    execute: () => Promise.reject(new Error('authenticateRequest no debería llamarse')),
  },
  listSchoolUsers: {
    execute: () => Promise.reject(new Error('listSchoolUsers no debería llamarse')),
  },
  manageSchoolUser: {
    execute: () => Promise.reject(new Error('manageSchoolUser no debería llamarse')),
  },
  createInvitation: {
    execute: () => Promise.reject(new Error('createInvitation no debería llamarse')),
  },
  listPendingInvitations: {
    execute: () => Promise.reject(new Error('listPendingInvitations no debería llamarse')),
  },
  revokeInvitation: {
    execute: () => Promise.reject(new Error('revokeInvitation no debería llamarse')),
  },
  lookupInvitation: {
    execute: () => Promise.reject(new Error('lookupInvitation no debería llamarse')),
  },
  acceptInvitation: {
    execute: () => Promise.reject(new Error('acceptInvitation no debería llamarse')),
  },
  createPasswordReset: {
    execute: () => Promise.reject(new Error('createPasswordReset no debería llamarse')),
  },
  revokePasswordReset: {
    execute: () => Promise.reject(new Error('revokePasswordReset no debería llamarse')),
  },
  lookupPasswordReset: {
    execute: () => Promise.reject(new Error('lookupPasswordReset no debería llamarse')),
  },
  confirmPasswordReset: {
    execute: () => Promise.reject(new Error('confirmPasswordReset no debería llamarse')),
  },
  appOrigin: TEST_APP_ORIGIN,
};
