// Raíz de composición compartida por los puntos de entrada (`server.ts` y `lambda.ts`): construye
// el cliente Prisma, los repositorios, los casos de uso y la aplicación a partir de la configuración.
// Como ellos, conoce todas las capas y no pertenece a ninguna; la lógica de arranque (escuchar en
// un puerto o exportar el handler) se queda en cada punto de entrada.
import type { Express } from 'express';
import { AttemptLimiter } from './application/attempts/attemptLimiter.js';
import { AuthenticateRequest } from './application/authentication/authenticateRequest.js';
import { LOGIN_ATTEMPTS_WINDOW_MS, LogIn } from './application/login/logIn.js';
import { ListMunicipalities } from './application/municipality/listMunicipalities.js';
import type { CaptchaVerifier } from './application/registration/captchaVerifier.js';
import {
  LimitRegistrationAttempts,
  REGISTRATION_ATTEMPTS_WINDOW_MS,
} from './application/registration/limitRegistrationAttempts.js';
import { RegisterSchool } from './application/registration/registerSchool.js';
import { CreateSession } from './application/session/createSession.js';
import { LogOut } from './application/session/logOut.js';
import { RefreshSession } from './application/session/refreshSession.js';
import type { TokenIssuer } from './application/session/tokenIssuer.js';
import { ConfirmPasswordReset } from './application/passwordResets/confirmPasswordReset.js';
import { CreatePasswordReset } from './application/passwordResets/createPasswordReset.js';
import { LookupPasswordReset } from './application/passwordResets/lookupPasswordReset.js';
import { PASSWORD_RESET_ATTEMPTS_WINDOW_MS } from './application/passwordResets/passwordResetAttempts.js';
import { RevokePasswordReset } from './application/passwordResets/revokePasswordReset.js';
import { CreateCourse } from './application/courses/createCourse.js';
import { DeleteCourse } from './application/courses/deleteCourse.js';
import { GetCourse } from './application/courses/getCourse.js';
import { GetCourseDeletionImpact } from './application/courses/getCourseDeletionImpact.js';
import { ListCourses } from './application/courses/listCourses.js';
import { UpdateCourse } from './application/courses/updateCourse.js';
import { CreateProfessor } from './application/professors/createProfessor.js';
import { DeleteProfessor } from './application/professors/deleteProfessor.js';
import { GetProfessor } from './application/professors/getProfessor.js';
import { ListProfessors } from './application/professors/listProfessors.js';
import { UpdateProfessor } from './application/professors/updateProfessor.js';
import { CreateStudent } from './application/students/createStudent.js';
import { GetStudent } from './application/students/getStudent.js';
import { ListStudents } from './application/students/listStudents.js';
import { UpdateStudent } from './application/students/updateStudent.js';
import { DeleteStudent } from './application/students/deleteStudent.js';
import { CreateCalendar } from './application/calendars/createCalendar.js';
import { GetCalendar } from './application/calendars/getCalendar.js';
import { ListCalendars } from './application/calendars/listCalendars.js';
import { UpdateCalendar } from './application/calendars/updateCalendar.js';
import { AcceptInvitation } from './application/invitations/acceptInvitation.js';
import { CreateInvitation } from './application/invitations/createInvitation.js';
import { INVITATION_ATTEMPTS_WINDOW_MS } from './application/invitations/invitationAttempts.js';
import { ListPendingInvitations } from './application/invitations/listPendingInvitations.js';
import { LookupInvitation } from './application/invitations/lookupInvitation.js';
import { RevokeInvitation } from './application/invitations/revokeInvitation.js';
import { ListSchoolUsers } from './application/users/listSchoolUsers.js';
import { ManageSchoolUser } from './application/users/manageSchoolUser.js';
import { createApp } from './app.js';
import { BcryptPasswordHasher } from './infrastructure/bcryptPasswordHasher.js';
import type { AppConfig } from './infrastructure/config.js';
import { CryptoSecretTokenGenerator } from './infrastructure/cryptoSecretTokenGenerator.js';
import { createCaptchaVerifier } from './infrastructure/createCaptchaVerifier.js';
import { JoseTokenIssuer } from './infrastructure/joseTokenIssuer.js';
import type { Logger } from './infrastructure/logger.js';
import {
  createPrismaClient,
  type PrismaClient,
  type PrismaClientOptions,
} from './infrastructure/prisma/createPrismaClient.js';
import { PrismaAccessLinkRepository } from './infrastructure/prisma/prismaAccessLinkRepository.js';
import { PrismaCourseRepository } from './infrastructure/prisma/prismaCourseRepository.js';
import { PrismaProfessorRepository } from './infrastructure/prisma/prismaProfessorRepository.js';
import { PrismaStudentRepository } from './infrastructure/prisma/prismaStudentRepository.js';
import { PrismaCalendarRepository } from './infrastructure/prisma/prismaCalendarRepository.js';
import { PrismaAttemptRepository } from './infrastructure/prisma/prismaAttemptRepository.js';
import { PrismaDatabasePing } from './infrastructure/prisma/prismaDatabasePing.js';
import { PrismaMunicipalityRepository } from './infrastructure/prisma/prismaMunicipalityRepository.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma/prismaRefreshTokenRepository.js';
import { PrismaSchoolUserRepository } from './infrastructure/prisma/prismaSchoolUserRepository.js';
import { PrismaRegistrationRepository } from './infrastructure/prisma/prismaRegistrationRepository.js';
import { PrismaUserCredentialsRepository } from './infrastructure/prisma/prismaUserCredentialsRepository.js';
import { UuidV7IdGenerator } from './infrastructure/uuidV7IdGenerator.js';

export interface ComposeAppOptions {
  logger: Logger;
  /** Conexiones máximas del pool: `lambda.ts` usa 2; `server.ts`, el valor por defecto de `pg`. */
  poolMax?: number;
  /** TLS hacia la base de datos: `lambda.ts` lo usa con la CA de Supabase. */
  ssl?: PrismaClientOptions['ssl'];
  /**
   * Solo para los tests de integración: un cliente ya creado (con su esquema de worker). Quien lo
   * pasa es responsable de cerrarlo; por defecto, `composeApp` crea el suyo con `DATABASE_URL`.
   */
  prisma?: PrismaClient;
  /** Reloj de los casos de uso; por defecto, la hora real. Los tests lo fijan. */
  now?: () => Date;
  /** Solo para los tests: sustituye al verificador que elegiría `createCaptchaVerifier`. */
  captchaVerifier?: CaptchaVerifier;
}

export interface ComposedApp {
  app: Express;
  /** Para cerrar el pool al terminar. */
  prisma: PrismaClient;
  /** Los tests de integración lo usan para emitir access tokens válidos. */
  tokenIssuer: TokenIssuer;
}

/** Compone la aplicación real a partir de una configuración ya validada. */
export function composeApp(
  config: AppConfig,
  {
    logger,
    poolMax,
    ssl,
    prisma = createPrismaClient({ connectionString: config.databaseUrl, poolMax, ssl }),
    now = () => new Date(),
    captchaVerifier = createCaptchaVerifier({
      recaptcha: config.recaptcha,
      appOrigin: config.appOrigin,
      logger,
    }),
  }: ComposeAppOptions,
): ComposedApp {
  const municipalityRepository = new PrismaMunicipalityRepository(prisma);
  const idGenerator = new UuidV7IdGenerator();
  // Un solo generador para los refresh tokens de las sesiones y, después, los enlaces de acceso.
  const secretTokenGenerator = new CryptoSecretTokenGenerator();
  const tokenIssuer = new JoseTokenIssuer(config.jwtSecret, now);
  const passwordHasher = new BcryptPasswordHasher();
  const createSession = new CreateSession({
    idGenerator,
    refreshTokenGenerator: secretTokenGenerator,
    now,
  });
  const schoolUserRepository = new PrismaSchoolUserRepository(prisma);
  const refreshTokenRepository = new PrismaRefreshTokenRepository(prisma);
  const accessLinkRepository = new PrismaAccessLinkRepository(prisma);
  const courseRepository = new PrismaCourseRepository(prisma);
  const professorRepository = new PrismaProfessorRepository(prisma);
  const studentRepository = new PrismaStudentRepository(prisma);
  const calendarRepository = new PrismaCalendarRepository(prisma, () => idGenerator.generate());

  // Un limitador por operación, con su propia política, sobre la misma tabla de intentos.
  const attemptRepository = new PrismaAttemptRepository(prisma, idGenerator);
  const limitRegistrationAttempts = new LimitRegistrationAttempts({
    attemptLimiter: new AttemptLimiter({
      attemptRepository,
      policy: {
        maxAttempts: config.registrationAttemptsMax,
        windowMs: REGISTRATION_ATTEMPTS_WINDOW_MS,
      },
      now,
    }),
    logger,
  });
  const loginAttemptLimiter = new AttemptLimiter({
    attemptRepository,
    policy: { maxAttempts: config.loginAttemptsMax, windowMs: LOGIN_ATTEMPTS_WINDOW_MS },
    now,
  });

  const invitationAttemptLimiter = new AttemptLimiter({
    attemptRepository,
    policy: {
      maxAttempts: config.invitationAttemptsMax,
      windowMs: INVITATION_ATTEMPTS_WINDOW_MS,
    },
    now,
  });

  // Contador propio, independiente del de las invitaciones (clave `password-reset:<ip>`).
  const passwordResetAttemptLimiter = new AttemptLimiter({
    attemptRepository,
    policy: {
      maxAttempts: config.passwordResetAttemptsMax,
      windowMs: PASSWORD_RESET_ATTEMPTS_WINDOW_MS,
    },
    now,
  });

  const app = createApp({
    databasePing: new PrismaDatabasePing(prisma, logger),
    logger,
    limitRegistrationAttempts,
    registerSchool: new RegisterSchool({
      registrationRepository: new PrismaRegistrationRepository(prisma),
      municipalityRepository,
      passwordHasher,
      idGenerator,
      // El real con los secretos de reCAPTCHA y el falso sin ellos (que loadConfig exige en producción).
      captchaVerifier,
      createSession,
      now,
      logger,
    }),
    refreshSession: new RefreshSession({
      refreshTokenRepository,
      refreshTokenGenerator: secretTokenGenerator,
      tokenIssuer,
      now,
      logger,
    }),
    logIn: new LogIn({
      attemptLimiter: loginAttemptLimiter,
      captchaVerifier,
      userCredentialsRepository: new PrismaUserCredentialsRepository(prisma),
      passwordHasher,
      createSession,
      refreshTokenRepository,
      logger,
    }),
    logOut: new LogOut({
      refreshTokenRepository,
      refreshTokenGenerator: secretTokenGenerator,
      now,
      logger,
    }),
    listMunicipalities: new ListMunicipalities(municipalityRepository),
    authenticateRequest: new AuthenticateRequest({ tokenIssuer, refreshTokenRepository, now }),
    listSchoolUsers: new ListSchoolUsers({ schoolUserRepository, now }),
    manageSchoolUser: new ManageSchoolUser({ schoolUserRepository, now, logger }),
    createCourse: new CreateCourse({ courseRepository, idGenerator, logger }),
    listCourses: new ListCourses({ courseRepository }),
    getCourse: new GetCourse({ courseRepository }),
    updateCourse: new UpdateCourse({ courseRepository, idGenerator, logger }),
    getCourseDeletionImpact: new GetCourseDeletionImpact({ courseRepository }),
    deleteCourse: new DeleteCourse({ courseRepository, logger }),
    createProfessor: new CreateProfessor({ professorRepository, idGenerator, logger }),
    listProfessors: new ListProfessors({ professorRepository }),
    getProfessor: new GetProfessor({ professorRepository }),
    updateProfessor: new UpdateProfessor({ professorRepository, logger }),
    deleteProfessor: new DeleteProfessor({ professorRepository, logger }),
    createStudent: new CreateStudent({ studentRepository, idGenerator, logger }),
    listStudents: new ListStudents({ studentRepository }),
    getStudent: new GetStudent({ studentRepository }),
    updateStudent: new UpdateStudent({ studentRepository, logger }),
    deleteStudent: new DeleteStudent({ studentRepository, logger }),
    createCalendar: new CreateCalendar({ calendarRepository, idGenerator, logger }),
    listCalendars: new ListCalendars({ calendarRepository }),
    getCalendar: new GetCalendar({ calendarRepository }),
    updateCalendar: new UpdateCalendar({ calendarRepository, logger }),
    createInvitation: new CreateInvitation({
      accessLinkRepository,
      secretTokenGenerator,
      idGenerator,
      appOrigin: config.appOrigin,
      now,
      logger,
    }),
    listPendingInvitations: new ListPendingInvitations({ accessLinkRepository, now }),
    revokeInvitation: new RevokeInvitation({ accessLinkRepository, now, logger }),
    lookupInvitation: new LookupInvitation({
      attemptLimiter: invitationAttemptLimiter,
      accessLinkRepository,
      secretTokenGenerator,
      now,
      logger,
    }),
    acceptInvitation: new AcceptInvitation({
      attemptLimiter: invitationAttemptLimiter,
      accessLinkRepository,
      secretTokenGenerator,
      passwordHasher,
      idGenerator,
      now,
      logger,
    }),
    createPasswordReset: new CreatePasswordReset({
      accessLinkRepository,
      secretTokenGenerator,
      idGenerator,
      appOrigin: config.appOrigin,
      now,
      logger,
    }),
    revokePasswordReset: new RevokePasswordReset({ accessLinkRepository, now, logger }),
    lookupPasswordReset: new LookupPasswordReset({
      attemptLimiter: passwordResetAttemptLimiter,
      accessLinkRepository,
      secretTokenGenerator,
      now,
      logger,
    }),
    confirmPasswordReset: new ConfirmPasswordReset({
      attemptLimiter: passwordResetAttemptLimiter,
      accessLinkRepository,
      secretTokenGenerator,
      passwordHasher,
      now,
      logger,
    }),
    appOrigin: config.appOrigin,
    trustProxyHops: config.trustProxyHops,
    originVerifySecret: config.originVerifySecret,
  });

  return { app, prisma, tokenIssuer };
}
