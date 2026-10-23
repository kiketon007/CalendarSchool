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
  | 'createCourse'
  | 'listCourses'
  | 'getCourse'
  | 'updateCourse'
  | 'getCourseDeletionImpact'
  | 'deleteCourse'
  | 'createProfessor'
  | 'listProfessors'
  | 'getProfessor'
  | 'updateProfessor'
  | 'deleteProfessor'
  | 'createStudent'
  | 'listStudents'
  | 'getStudent'
  | 'updateStudent'
  | 'deleteStudent'
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
  createCourse: {
    execute: () => Promise.reject(new Error('createCourse no debería llamarse')),
  },
  listCourses: {
    execute: () => Promise.reject(new Error('listCourses no debería llamarse')),
  },
  getCourse: {
    execute: () => Promise.reject(new Error('getCourse no debería llamarse')),
  },
  updateCourse: {
    execute: () => Promise.reject(new Error('updateCourse no debería llamarse')),
  },
  getCourseDeletionImpact: {
    execute: () => Promise.reject(new Error('getCourseDeletionImpact no debería llamarse')),
  },
  deleteCourse: {
    execute: () => Promise.reject(new Error('deleteCourse no debería llamarse')),
  },
  createProfessor: {
    execute: () => Promise.reject(new Error('createProfessor no debería llamarse')),
  },
  listProfessors: {
    execute: () => Promise.reject(new Error('listProfessors no debería llamarse')),
  },
  getProfessor: {
    execute: () => Promise.reject(new Error('getProfessor no debería llamarse')),
  },
  updateProfessor: {
    execute: () => Promise.reject(new Error('updateProfessor no debería llamarse')),
  },
  deleteProfessor: {
    execute: () => Promise.reject(new Error('deleteProfessor no debería llamarse')),
  },
  createStudent: {
    execute: () => Promise.reject(new Error('createStudent no debería llamarse')),
  },
  listStudents: {
    execute: () => Promise.reject(new Error('listStudents no debería llamarse')),
  },
  getStudent: {
    execute: () => Promise.reject(new Error('getStudent no debería llamarse')),
  },
  updateStudent: {
    execute: () => Promise.reject(new Error('updateStudent no debería llamarse')),
  },
  deleteStudent: {
    execute: () => Promise.reject(new Error('deleteStudent no debería llamarse')),
  },
  appOrigin: TEST_APP_ORIGIN,
};
