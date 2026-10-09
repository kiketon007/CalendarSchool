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
  | 'listMunicipalities'
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
  listMunicipalities: {
    execute: () => Promise.reject(new Error('listMunicipalities no debería llamarse')),
  },
  appOrigin: TEST_APP_ORIGIN,
};
