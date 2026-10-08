import type { AppDependencies } from '../../src/app.js';

/**
 * Casos de uso de los que un test no depende: si la petición llegara a ejecutarlos, el test
 * fallaría con un error claro en lugar de usar datos inventados.
 */
export const unusedUseCases: Pick<AppDependencies, 'registerSchool' | 'listMunicipalities'> = {
  registerSchool: {
    execute: () => Promise.reject(new Error('registerSchool no debería llamarse')),
  },
  listMunicipalities: {
    execute: () => Promise.reject(new Error('listMunicipalities no debería llamarse')),
  },
};
