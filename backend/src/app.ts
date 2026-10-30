import express, { type Express } from 'express';
import type { AuthenticateRequest } from './application/authentication/authenticateRequest.js';
import type { ListMunicipalities } from './application/municipality/listMunicipalities.js';
import type { LogIn } from './application/login/logIn.js';
import { CheckHealth } from './application/health/checkHealth.js';
import type { LimitRegistrationAttempts } from './application/registration/limitRegistrationAttempts.js';
import type { RegisterSchool } from './application/registration/registerSchool.js';
import type { LogOut } from './application/session/logOut.js';
import type { RefreshSession } from './application/session/refreshSession.js';
import type { CreateCourse } from './application/courses/createCourse.js';
import type { DeleteCourse } from './application/courses/deleteCourse.js';
import type { GetCourse } from './application/courses/getCourse.js';
import type { GetCourseDeletionImpact } from './application/courses/getCourseDeletionImpact.js';
import type { ListCourses } from './application/courses/listCourses.js';
import type { UpdateCourse } from './application/courses/updateCourse.js';
import type { CreateProfessor } from './application/professors/createProfessor.js';
import type { DeleteProfessor } from './application/professors/deleteProfessor.js';
import type { GetProfessor } from './application/professors/getProfessor.js';
import type { ListProfessors } from './application/professors/listProfessors.js';
import type { UpdateProfessor } from './application/professors/updateProfessor.js';
import type { CreateStudent } from './application/students/createStudent.js';
import type { GetStudent } from './application/students/getStudent.js';
import type { ListStudents } from './application/students/listStudents.js';
import type { UpdateStudent } from './application/students/updateStudent.js';
import type { DeleteStudent } from './application/students/deleteStudent.js';
import type { CreateCalendar } from './application/calendars/createCalendar.js';
import type { GetCalendar } from './application/calendars/getCalendar.js';
import type { ListCalendars } from './application/calendars/listCalendars.js';
import type { UpdateCalendar } from './application/calendars/updateCalendar.js';
import type { CreateSubject } from './application/subjects/createSubject.js';
import type { GetSubject } from './application/subjects/getSubject.js';
import type { ListSubjects } from './application/subjects/listSubjects.js';
import type { DeleteSubject } from './application/subjects/deleteSubject.js';
import type { UpdateSubject } from './application/subjects/updateSubject.js';
import type { GetCourseWorkload } from './application/workload/getCourseWorkload.js';
import type { UpdateCourseWorkload } from './application/workload/updateCourseWorkload.js';
import type { DeleteCalendar } from './application/calendars/deleteCalendar.js';
import type { AcceptInvitation } from './application/invitations/acceptInvitation.js';
import type { CreateInvitation } from './application/invitations/createInvitation.js';
import type { ListPendingInvitations } from './application/invitations/listPendingInvitations.js';
import type { LookupInvitation } from './application/invitations/lookupInvitation.js';
import type { RevokeInvitation } from './application/invitations/revokeInvitation.js';
import type { ConfirmPasswordReset } from './application/passwordResets/confirmPasswordReset.js';
import type { CreatePasswordReset } from './application/passwordResets/createPasswordReset.js';
import type { LookupPasswordReset } from './application/passwordResets/lookupPasswordReset.js';
import type { RevokePasswordReset } from './application/passwordResets/revokePasswordReset.js';
import type { ListSchoolUsers } from './application/users/listSchoolUsers.js';
import type { ManageSchoolUser } from './application/users/manageSchoolUser.js';
import type { DatabasePing } from './application/health/databasePing.js';
import type { Logger } from './infrastructure/logger.js';
import { authRouter } from './presentation/auth/authRouter.js';
import { municipalityRouter } from './presentation/municipality/municipalityRouter.js';
import { healthRouter } from './presentation/health/healthRouter.js';
import { coursesRouter } from './presentation/courses/coursesRouter.js';
import { professorsRouter } from './presentation/professors/professorsRouter.js';
import { studentsRouter } from './presentation/students/studentsRouter.js';
import { calendarsRouter } from './presentation/calendars/calendarsRouter.js';
import { subjectsRouter } from './presentation/subjects/subjectsRouter.js';
import { workloadRouter } from './presentation/workload/workloadRouter.js';
import { invitationsRouter } from './presentation/invitations/invitationsRouter.js';
import { publicInvitationsRouter } from './presentation/invitations/publicInvitationsRouter.js';
import { publicPasswordResetsRouter } from './presentation/passwordResets/publicPasswordResetsRouter.js';
import { usersRouter } from './presentation/users/usersRouter.js';
import { errorHandler, notFoundHandler } from './presentation/http/errorHandler.js';
import { noStore } from './presentation/http/noStore.js';
import { REQUEST_TIMEOUT_MS, requestTimeout } from './presentation/http/requestTimeout.js';
import { requireOriginVerification } from './presentation/http/requireOriginVerification.js';

export interface AppDependencies {
  databasePing: DatabasePing;
  logger: Logger;
  limitRegistrationAttempts: Pick<LimitRegistrationAttempts, 'execute'>;
  registerSchool: Pick<RegisterSchool, 'execute'>;
  refreshSession: Pick<RefreshSession, 'execute'>;
  logIn: Pick<LogIn, 'execute'>;
  logOut: Pick<LogOut, 'execute'>;
  listMunicipalities: Pick<ListMunicipalities, 'execute'>;
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  listSchoolUsers: Pick<ListSchoolUsers, 'execute'>;
  manageSchoolUser: Pick<ManageSchoolUser, 'execute'>;
  createInvitation: Pick<CreateInvitation, 'execute'>;
  listPendingInvitations: Pick<ListPendingInvitations, 'execute'>;
  revokeInvitation: Pick<RevokeInvitation, 'execute'>;
  lookupInvitation: Pick<LookupInvitation, 'execute'>;
  acceptInvitation: Pick<AcceptInvitation, 'execute'>;
  createPasswordReset: Pick<CreatePasswordReset, 'execute'>;
  revokePasswordReset: Pick<RevokePasswordReset, 'execute'>;
  lookupPasswordReset: Pick<LookupPasswordReset, 'execute'>;
  confirmPasswordReset: Pick<ConfirmPasswordReset, 'execute'>;
  createCourse: Pick<CreateCourse, 'execute'>;
  listCourses: Pick<ListCourses, 'execute'>;
  getCourse: Pick<GetCourse, 'execute'>;
  updateCourse: Pick<UpdateCourse, 'execute'>;
  getCourseDeletionImpact: Pick<GetCourseDeletionImpact, 'execute'>;
  deleteCourse: Pick<DeleteCourse, 'execute'>;
  createProfessor: Pick<CreateProfessor, 'execute'>;
  listProfessors: Pick<ListProfessors, 'execute'>;
  getProfessor: Pick<GetProfessor, 'execute'>;
  updateProfessor: Pick<UpdateProfessor, 'execute'>;
  deleteProfessor: Pick<DeleteProfessor, 'execute'>;
  createStudent: Pick<CreateStudent, 'execute'>;
  listStudents: Pick<ListStudents, 'execute'>;
  getStudent: Pick<GetStudent, 'execute'>;
  updateStudent: Pick<UpdateStudent, 'execute'>;
  deleteStudent: Pick<DeleteStudent, 'execute'>;
  createCalendar: Pick<CreateCalendar, 'execute'>;
  listCalendars: Pick<ListCalendars, 'execute'>;
  getCalendar: Pick<GetCalendar, 'execute'>;
  updateCalendar: Pick<UpdateCalendar, 'execute'>;
  deleteCalendar: Pick<DeleteCalendar, 'execute'>;
  createSubject: Pick<CreateSubject, 'execute'>;
  listSubjects: Pick<ListSubjects, 'execute'>;
  getSubject: Pick<GetSubject, 'execute'>;
  updateSubject: Pick<UpdateSubject, 'execute'>;
  deleteSubject: Pick<DeleteSubject, 'execute'>;
  getCourseWorkload: Pick<GetCourseWorkload, 'execute'>;
  updateCourseWorkload: Pick<UpdateCourseWorkload, 'execute'>;
  /** Origen de la aplicación: el único desde el que se aceptan `POST /api/auth/login` y `/refresh`. */
  appOrigin: string;
  /**
   * Proxies de confianza delante del backend (`TRUST_PROXY_HOPS`); por defecto, 0. De ellos depende
   * `req.ip`: con 0 es la dirección de la conexión y con N, la que está N saltos desde la derecha de
   * `X-Forwarded-For`, de modo que el cliente no puede elegir su IP escribiendo la cabecera.
   */
  trustProxyHops?: number;
  /**
   * Secreto que CloudFront envía en `X-Origin-Verify`. Si se indica, toda petición sin él se rechaza
   * con `403 ORIGIN_NOT_ALLOWED` antes que cualquier otro middleware; sin él (desarrollo, tests y
   * E2E) no se comprueba nada.
   */
  originVerifySecret?: string;
  /** Límite de tiempo por petición; por defecto, 10 s. Los tests lo reducen. */
  requestTimeoutMs?: number;
}

/**
 * Compone la aplicación Express. Recibe todas sus dependencias por parámetro y nunca lee
 * process.env: así se prueba con Supertest y dobles, y más adelante se envuelve para Lambda.
 */
export function createApp({
  databasePing,
  logger,
  limitRegistrationAttempts,
  registerSchool,
  refreshSession,
  logIn,
  logOut,
  listMunicipalities,
  authenticateRequest,
  listSchoolUsers,
  manageSchoolUser,
  createInvitation,
  listPendingInvitations,
  revokeInvitation,
  lookupInvitation,
  acceptInvitation,
  createPasswordReset,
  revokePasswordReset,
  lookupPasswordReset,
  confirmPasswordReset,
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  getCourseDeletionImpact,
  deleteCourse,
  createProfessor,
  listProfessors,
  getProfessor,
  updateProfessor,
  deleteProfessor,
  createStudent,
  listStudents,
  getStudent,
  updateStudent,
  deleteStudent,
  createCalendar,
  listCalendars,
  getCalendar,
  updateCalendar,
  deleteCalendar,
  createSubject,
  listSubjects,
  getSubject,
  updateSubject,
  deleteSubject,
  getCourseWorkload,
  updateCourseWorkload,
  appOrigin,
  trustProxyHops = 0,
  originVerifySecret,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);

  // Lo primero de todo: una petición que no viene de CloudFront no debe llegar ni a analizar el
  // cuerpo. `trust proxy` ya está fijado, así que el `debug` de este middleware ve la IP resuelta.
  if (originVerifySecret !== undefined) {
    app.use(requireOriginVerification(originVerifySecret, logger));
  }
  app.use(requestTimeout(requestTimeoutMs));
  // Antes del parser de JSON: sus errores (400, 413) también son respuestas de la API.
  app.use('/api', noStore);
  app.use(express.json());

  const api = express.Router();
  api.use('/health', healthRouter(new CheckHealth(databasePing, logger)));
  api.use(
    '/auth',
    authRouter({
      limitRegistrationAttempts,
      registerSchool,
      refreshSession,
      logIn,
      logOut,
      appOrigin,
    }),
  );
  api.use('/municipalities', municipalityRouter(listMunicipalities));
  api.use(
    '/users',
    usersRouter({
      authenticateRequest,
      listSchoolUsers,
      manageSchoolUser,
      createPasswordReset,
      revokePasswordReset,
      logger,
    }),
  );
  // Las rutas públicas del restablecimiento: se autentican con el token del enlace, sin sesión.
  api.use(
    '/password-resets',
    publicPasswordResetsRouter({ lookupPasswordReset, confirmPasswordReset }),
  );
  // Las rutas públicas de la persona invitada van antes: el router de los administradores exige
  // sesión en todas las suyas.
  api.use('/invitations', publicInvitationsRouter({ lookupInvitation, acceptInvitation }));
  api.use(
    '/invitations',
    invitationsRouter({
      authenticateRequest,
      createInvitation,
      listPendingInvitations,
      revokeInvitation,
      logger,
    }),
  );
  // La carga horaria de un curso (US19): la ven los dos roles y solo el `ADMIN` la cambia. Va antes que
  // `/courses` para que `/courses/:id/workload` no pase por las rutas de los cursos.
  api.use(
    '/courses/:id/workload',
    workloadRouter({
      authenticateRequest,
      getCourseWorkload,
      updateCourseWorkload,
      logger,
    }),
  );
  // Los cursos del colegio (US05): los pueden usar los dos roles, así que solo exigen sesión.
  api.use(
    '/courses',
    coursesRouter({
      authenticateRequest,
      createCourse,
      listCourses,
      getCourse,
      updateCourse,
      getCourseDeletionImpact,
      deleteCourse,
      logger,
    }),
  );
  // Los profesores del colegio (US09): los pueden usar los dos roles, así que solo exigen sesión.
  api.use(
    '/professors',
    professorsRouter({
      authenticateRequest,
      createProfessor,
      listProfessors,
      getProfessor,
      updateProfessor,
      deleteProfessor,
      logger,
    }),
  );
  // Los alumnos del colegio (US14): los pueden usar los dos roles, así que solo exigen sesión.
  api.use(
    '/students',
    studentsRouter({
      authenticateRequest,
      createStudent,
      listStudents,
      getStudent,
      updateStudent,
      deleteStudent,
      logger,
    }),
  );
  // Los calendarios base del colegio (US-BASE): los ven los dos roles y solo el `ADMIN` crea.
  api.use(
    '/calendars',
    calendarsRouter({
      authenticateRequest,
      createCalendar,
      listCalendars,
      getCalendar,
      updateCalendar,
      deleteCalendar,
      logger,
    }),
  );
  // Las asignaturas del colegio (US-SUBJECT y US-SUBJECT_b): las ven los dos roles y solo el `ADMIN` crea y edita.
  api.use(
    '/subjects',
    subjectsRouter({
      authenticateRequest,
      createSubject,
      listSubjects,
      getSubject,
      updateSubject,
      deleteSubject,
      logger,
    }),
  );
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use(errorHandler(logger));

  return app;
}
