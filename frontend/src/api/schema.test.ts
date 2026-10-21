import { describe, expectTypeOf, it } from 'vitest';
import type { components, paths } from './generated/schema';

// Comprobaciones de tipos: fallan en `npm run typecheck` si los tipos generados desde
// docs/api-spec.yml dejan de reflejar el contrato del registro.
type Schemas = components['schemas'];

describe('generated API types', () => {
  it('describe the registration request', () => {
    expectTypeOf<Schemas['RegisterRequest']>().toEqualTypeOf<{
      schoolName: string;
      municipalityCode: string;
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      privacyPolicyAccepted: true;
      captcha: Schemas['CaptchaToken'];
    }>();
    expectTypeOf<Schemas['CaptchaToken']['version']>().toEqualTypeOf<'v3' | 'v2'>();
  });

  it('describe the registration response without credentials', () => {
    expectTypeOf<Schemas['RegisterResponse']['data']['user']>().toEqualTypeOf<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    }>();
    expectTypeOf<Schemas['RegisterResponse']['data']['school']>().toEqualTypeOf<{
      id: string;
      name: string;
      municipality: Schemas['Municipality'];
    }>();
  });

  it('include the registration error codes', () => {
    expectTypeOf<
      | 'VALIDATION_ERROR'
      | 'EMAIL_ALREADY_REGISTERED'
      | 'SCHOOL_ALREADY_REGISTERED'
      | 'CAPTCHA_CHALLENGE_REQUIRED'
      | 'CAPTCHA_FAILED'
      | 'TOO_MANY_REQUESTS'
    >().toExtend<Schemas['ErrorCode']>();
  });

  it('require the Retry-After header on 429 responses', () => {
    // Una cabecera opcional se tiparía como `number | undefined`.
    expectTypeOf<
      components['responses']['TooManyRequests']['headers']['Retry-After']
    >().toEqualTypeOf<number>();
  });

  it('describe field errors as { field, code }', () => {
    expectTypeOf<Schemas['FieldError']>().toEqualTypeOf<{
      field: string;
      code: Schemas['FieldErrorCode'];
    }>();
    expectTypeOf<Schemas['FieldErrorCode']>().toEqualTypeOf<
      | 'REQUIRED'
      | 'INVALID_LENGTH'
      | 'INVALID_FORMAT'
      | 'INVALID_CHARACTERS'
      | 'WEAK_PASSWORD'
      | 'DUPLICATE'
      | 'NOT_FOUND'
    >();
  });

  it('keep the registration response body without tokens', () => {
    expectTypeOf<keyof Schemas['RegisterResponse']['data']>().toEqualTypeOf<'user' | 'school'>();
  });

  it('describe the refresh response with session, user and school', () => {
    expectTypeOf<Schemas['SessionResponse']['data']>().toEqualTypeOf<{
      session: Schemas['Session'];
      user: Schemas['SessionUser'];
      school: Schemas['SessionSchool'];
    }>();
    expectTypeOf<Schemas['Session']>().toEqualTypeOf<{ accessToken: string; expiresIn: 900 }>();
    expectTypeOf<Schemas['SessionUser']>().toEqualTypeOf<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: 'ADMIN' | 'MEMBER';
    }>();
    expectTypeOf<Schemas['SessionSchool']>().toEqualTypeOf<{ id: string; name: string }>();
  });

  it('describe the login request', () => {
    expectTypeOf<Schemas['LoginRequest']>().toEqualTypeOf<{
      email: string;
      password: string;
      captcha: Schemas['CaptchaToken'];
    }>();
  });

  it('include the login error codes', () => {
    expectTypeOf<'INVALID_CREDENTIALS' | 'ACCOUNT_SUSPENDED'>().toExtend<Schemas['ErrorCode']>();
  });

  it('include the captcha unavailable code', () => {
    expectTypeOf<'CAPTCHA_UNAVAILABLE'>().toExtend<Schemas['ErrorCode']>();
  });

  it('include the session error codes', () => {
    expectTypeOf<'INVALID_SESSION' | 'ORIGIN_NOT_ALLOWED'>().toExtend<Schemas['ErrorCode']>();
  });

  it('describe the logout operation without a body and with the cookie header on 204', () => {
    type Logout = paths['/api/auth/logout']['post'];
    expectTypeOf<Logout['requestBody']>().toEqualTypeOf<undefined>();
    expectTypeOf<keyof Logout['responses']>().toEqualTypeOf<204 | 403 | 500 | 503>();
    // Una cabecera opcional se tiparía como `string | undefined`.
    expectTypeOf<Logout['responses'][204]['headers']['Set-Cookie']>().toEqualTypeOf<string>();
    expectTypeOf<
      Logout['responses'][204]['headers']['Cache-Control']
    >().toEqualTypeOf<'no-store'>();
  });

  it('describe the school users list as a protected operation without personal secrets', () => {
    type ListUsers = paths['/api/users']['get'];
    expectTypeOf<keyof ListUsers['responses']>().toEqualTypeOf<200 | 401 | 403 | 500 | 503>();
    expectTypeOf<Schemas['SchoolUser']>().toEqualTypeOf<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: 'ADMIN' | 'MEMBER';
      status: 'ACTIVE' | 'SUSPENDED';
      passwordResetPending: boolean;
      createdAt: string;
    }>();
    expectTypeOf<Schemas['SchoolUserListResponse']['data']>().toEqualTypeOf<
      Schemas['SchoolUser'][]
    >();
    expectTypeOf<'FORBIDDEN' | 'INVALID_SESSION'>().toExtend<Schemas['ErrorCode']>();
    // Una cabecera opcional se tiparía como `string | undefined`.
    expectTypeOf<
      components['responses']['Unauthorized']['headers']['WWW-Authenticate']
    >().toEqualTypeOf<'Bearer'>();
  });

  it('describe the user management operations as protected and one per action', () => {
    type ChangeRole = paths['/api/users/{id}/role']['put'];
    type Suspend = paths['/api/users/{id}/suspend']['post'];
    type Reactivate = paths['/api/users/{id}/reactivate']['post'];
    expectTypeOf<keyof ChangeRole['responses']>().toEqualTypeOf<
      200 | 400 | 401 | 403 | 404 | 409 | 500 | 503
    >();
    expectTypeOf<keyof Suspend['responses']>().toEqualTypeOf<
      200 | 401 | 403 | 404 | 409 | 500 | 503
    >();
    // Reactivar nunca reduce los administradores: no tiene `409`.
    expectTypeOf<keyof Reactivate['responses']>().toEqualTypeOf<
      200 | 401 | 403 | 404 | 500 | 503
    >();
    expectTypeOf<Schemas['ChangeUserRoleRequest']>().toEqualTypeOf<{
      role: 'ADMIN' | 'MEMBER';
    }>();
    expectTypeOf<Schemas['SchoolUserResponse']['data']>().toEqualTypeOf<Schemas['SchoolUser']>();
    expectTypeOf<ChangeRole['parameters']['path']['id']>().toEqualTypeOf<string>();
    expectTypeOf<Suspend['requestBody']>().toEqualTypeOf<undefined>();
    expectTypeOf<Reactivate['requestBody']>().toEqualTypeOf<undefined>();
  });

  it('include the user management error codes', () => {
    expectTypeOf<'LAST_ADMIN_REQUIRED' | 'CANNOT_SUSPEND_SELF' | 'USER_NOT_ACTIVE'>().toExtend<
      Schemas['ErrorCode']
    >();
  });

  it('describe the invitations as protected operations that return the link only on creation', () => {
    type Create = paths['/api/invitations']['post'];
    type List = paths['/api/invitations']['get'];
    type Revoke = paths['/api/invitations/{id}/revoke']['post'];
    expectTypeOf<keyof Create['responses']>().toEqualTypeOf<201 | 400 | 401 | 403 | 500 | 503>();
    expectTypeOf<keyof List['responses']>().toEqualTypeOf<200 | 401 | 403 | 500 | 503>();
    expectTypeOf<keyof Revoke['responses']>().toEqualTypeOf<204 | 401 | 403 | 404 | 500 | 503>();
    expectTypeOf<Schemas['CreateInvitationRequest']>().toEqualTypeOf<{
      role: 'ADMIN' | 'MEMBER';
    }>();
    // La invitación nunca lleva el enlace ni el token: solo la respuesta de la creación trae `url`.
    expectTypeOf<Schemas['Invitation']>().toEqualTypeOf<{
      id: string;
      role: 'ADMIN' | 'MEMBER';
      createdBy: { id: string; firstName: string; lastName: string };
      createdAt: string;
      expiresAt: string;
    }>();
    expectTypeOf<Schemas['InvitationCreatedResponse']['data']>().toEqualTypeOf<{
      invitation: Schemas['Invitation'];
      url: string;
    }>();
    expectTypeOf<Schemas['InvitationListResponse']['data']>().toEqualTypeOf<
      Schemas['Invitation'][]
    >();
    expectTypeOf<Revoke['parameters']['path']['id']>().toEqualTypeOf<string>();
    expectTypeOf<Revoke['requestBody']>().toEqualTypeOf<undefined>();
  });

  it('include the invalid access link error code', () => {
    expectTypeOf<'ACCESS_LINK_INVALID'>().toExtend<Schemas['ErrorCode']>();
  });

  it('describe the public invitation operations, which need no session and never create one', () => {
    type Lookup = paths['/api/invitations/lookup']['post'];
    type Accept = paths['/api/invitations/accept']['post'];
    expectTypeOf<keyof Lookup['responses']>().toEqualTypeOf<
      200 | 410 | 413 | 415 | 429 | 500 | 503
    >();
    expectTypeOf<keyof Accept['responses']>().toEqualTypeOf<
      201 | 400 | 409 | 410 | 413 | 415 | 429 | 500 | 503
    >();
    expectTypeOf<Schemas['InvitationLookupRequest']>().toEqualTypeOf<{ token: string }>();
    expectTypeOf<Schemas['InvitationLookupResponse']['data']>().toEqualTypeOf<{
      school: { name: string };
      role: 'ADMIN' | 'MEMBER';
    }>();
    // El colegio y el rol salen de la invitación: el cuerpo no los declara.
    expectTypeOf<Schemas['AcceptInvitationRequest']>().toEqualTypeOf<{
      token: string;
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      privacyPolicyAccepted: true;
    }>();
    expectTypeOf<Schemas['InvitationAcceptedResponse']['data']>().toEqualTypeOf<{
      user: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        role: 'ADMIN' | 'MEMBER';
      };
      school: { id: string; name: string };
    }>();
    // Aceptar no inicia sesión: la respuesta 201 no declara cabeceras de cookie.
    expectTypeOf<Accept['responses'][201]['headers']>().toEqualTypeOf<{
      'Cache-Control': 'no-store';
      [name: string]: unknown;
    }>();
  });

  it('describe the password reset as protected operations that return the link only on creation', () => {
    type Create = paths['/api/users/{id}/password-reset']['post'];
    type Revoke = paths['/api/users/{id}/password-reset/revoke']['post'];
    expectTypeOf<keyof Create['responses']>().toEqualTypeOf<
      201 | 401 | 403 | 404 | 409 | 500 | 503
    >();
    expectTypeOf<keyof Revoke['responses']>().toEqualTypeOf<204 | 401 | 403 | 404 | 500 | 503>();
    // El restablecimiento nunca lleva el enlace ni el token: solo la respuesta de la creación trae `url`.
    expectTypeOf<Schemas['PasswordReset']>().toEqualTypeOf<{
      userId: string;
      createdAt: string;
      expiresAt: string;
    }>();
    expectTypeOf<Schemas['PasswordResetCreatedResponse']['data']>().toEqualTypeOf<{
      passwordReset: Schemas['PasswordReset'];
      url: string;
    }>();
    expectTypeOf<Create['parameters']['path']['id']>().toEqualTypeOf<string>();
    expectTypeOf<Create['requestBody']>().toEqualTypeOf<undefined>();
    expectTypeOf<Revoke['requestBody']>().toEqualTypeOf<undefined>();
  });

  it('describe the public password reset operations, which need no session and never create one', () => {
    type Lookup = paths['/api/password-resets/lookup']['post'];
    type Confirm = paths['/api/password-resets/confirm']['post'];
    expectTypeOf<keyof Lookup['responses']>().toEqualTypeOf<
      200 | 410 | 413 | 415 | 429 | 500 | 503
    >();
    expectTypeOf<keyof Confirm['responses']>().toEqualTypeOf<
      204 | 400 | 410 | 413 | 415 | 429 | 500 | 503
    >();
    expectTypeOf<Schemas['PasswordResetLookupRequest']>().toEqualTypeOf<{ token: string }>();
    expectTypeOf<Schemas['PasswordResetLookupResponse']['data']>().toEqualTypeOf<{
      school: { name: string };
      email: string;
    }>();
    // La cuenta sale del enlace: el cuerpo solo declara el token y la contraseña.
    expectTypeOf<Schemas['ConfirmPasswordResetRequest']>().toEqualTypeOf<{
      token: string;
      password: string;
    }>();
    // Confirmar no inicia sesión: la respuesta 204 no declara cabeceras de cookie.
    expectTypeOf<Confirm['responses'][204]['headers']>().toEqualTypeOf<{
      'Cache-Control': 'no-store';
      [name: string]: unknown;
    }>();
  });

  it('describe the courses as protected operations whose classes carry their tutor', () => {
    type Create = paths['/api/courses']['post'];
    type List = paths['/api/courses']['get'];
    expectTypeOf<keyof Create['responses']>().toEqualTypeOf<201 | 400 | 401 | 409 | 500 | 503>();
    expectTypeOf<keyof List['responses']>().toEqualTypeOf<200 | 401 | 500 | 503>();
    expectTypeOf<'COURSE_ALREADY_EXISTS'>().toExtend<Schemas['ErrorCode']>();
    // El cuerpo solo declara el nombre y las clases: ni el colegio ni el tutor los decide el cliente.
    expectTypeOf<Schemas['CreateCourseRequest']>().toEqualTypeOf<{
      name: string;
      classes: Schemas['CreateClassRequest'][];
    }>();
    expectTypeOf<Schemas['CreateClassRequest']>().toEqualTypeOf<{ name: string }>();
    // El tutor de una clase es el profesor que la tutoriza o `null` si no tiene.
    expectTypeOf<Schemas['SchoolClass']>().toEqualTypeOf<{
      id: string;
      name: string;
      tutor: Schemas['TutorSummary'] | null;
    }>();
    expectTypeOf<Schemas['Course']>().toEqualTypeOf<{
      id: string;
      name: string;
      createdAt: string;
      classes: Schemas['SchoolClass'][];
    }>();
    expectTypeOf<Schemas['CourseCreatedResponse']['data']>().toEqualTypeOf<{
      course: Schemas['Course'];
    }>();
    expectTypeOf<Schemas['CourseListResponse']['data']>().toEqualTypeOf<{
      courses: Schemas['Course'][];
    }>();
  });

  it('describe reading and editing a course, whose classes keep their id', () => {
    type Get = paths['/api/courses/{id}']['get'];
    type Put = paths['/api/courses/{id}']['put'];
    expectTypeOf<keyof Get['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    expectTypeOf<keyof Put['responses']>().toEqualTypeOf<200 | 400 | 401 | 404 | 409 | 500 | 503>();
    expectTypeOf<'COURSE_CHANGED'>().toExtend<Schemas['ErrorCode']>();
    expectTypeOf<'PROFESSOR_ALREADY_TUTOR'>().toExtend<Schemas['ErrorCode']>();
    // Una clase con `id` se conserva (renombrada); sin `id` se crea. El colegio no viaja. El `tutorId`
    // es opcional: omitido no cambia el tutor, `null` lo quita y un UUID lo asigna.
    expectTypeOf<Schemas['UpdateCourseRequest']>().toEqualTypeOf<{
      name: string;
      classes: Schemas['UpdateClassRequest'][];
    }>();
    expectTypeOf<Schemas['UpdateClassRequest']>().toEqualTypeOf<{
      id?: string;
      name: string;
      tutorId?: string | null;
    }>();
    expectTypeOf<Schemas['CourseResponse']['data']>().toEqualTypeOf<{
      course: Schemas['Course'];
    }>();
  });

  it('describe the impact of deleting a course and the delete itself', () => {
    type Impact = paths['/api/courses/{id}/impact']['get'];
    type Delete = paths['/api/courses/{id}']['delete'];
    expectTypeOf<keyof Impact['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    expectTypeOf<keyof Delete['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    // `studentCount` está en el contrato desde ya, siempre 0 hasta que existan los alumnos.
    expectTypeOf<Schemas['CourseImpact']>().toEqualTypeOf<{
      classCount: number;
      studentCount: number;
    }>();
    expectTypeOf<Schemas['CourseImpactResponse']['data']>().toEqualTypeOf<{
      impact: Schemas['CourseImpact'];
    }>();
    expectTypeOf<Schemas['CourseDeletedResponse']['data']>().toEqualTypeOf<{
      deleted: Schemas['CourseImpact'];
    }>();
  });

  it('describe the professors as protected operations, with the subjects prepared but empty', () => {
    type Create = paths['/api/professors']['post'];
    type List = paths['/api/professors']['get'];
    expectTypeOf<keyof Create['responses']>().toEqualTypeOf<201 | 400 | 401 | 409 | 500 | 503>();
    expectTypeOf<keyof List['responses']>().toEqualTypeOf<200 | 401 | 500 | 503>();
    expectTypeOf<'CLASS_ALREADY_HAS_TUTOR'>().toExtend<Schemas['ErrorCode']>();
    expectTypeOf<'NOT_FOUND'>().toExtend<Schemas['FieldErrorCode']>();
    expectTypeOf<Schemas['ProfessorPosition']>().toEqualTypeOf<'DIRECTOR' | 'JEFE_ESTUDIOS'>();
    // El cuerpo solo declara lo que el cliente decide: ni el colegio ni las asignaturas.
    expectTypeOf<Schemas['CreateProfessorRequest']>().toEqualTypeOf<{
      firstName: string;
      lastName: string;
      position?: Schemas['ProfessorPosition'] | null;
      classId?: string | null;
    }>();
    expectTypeOf<Schemas['TutorSummary']>().toEqualTypeOf<{
      id: string;
      firstName: string;
      lastName: string;
    }>();
    expectTypeOf<Schemas['TutoredClass']>().toEqualTypeOf<{
      id: string;
      name: string;
      courseId: string;
      courseName: string;
    }>();
    // `subjects` está en el contrato desde ya y va vacío hasta `US-PROF-ASSIGN`.
    expectTypeOf<Schemas['Professor']>().toEqualTypeOf<{
      id: string;
      firstName: string;
      lastName: string;
      position: Schemas['ProfessorPosition'] | null;
      subjects: Record<string, never>[];
      tutoredClass: Schemas['TutoredClass'] | null;
    }>();
    expectTypeOf<Schemas['ProfessorResponse']['data']>().toEqualTypeOf<{
      professor: Schemas['Professor'];
    }>();
    expectTypeOf<Schemas['ProfessorListResponse']['data']>().toEqualTypeOf<{
      professors: Schemas['Professor'][];
    }>();
  });

  it('describe the municipality catalog', () => {
    expectTypeOf<Schemas['Municipality']>().toEqualTypeOf<{
      code: string;
      name: string;
      province: string;
    }>();
    expectTypeOf<Schemas['MunicipalityListResponse']['data']>().toEqualTypeOf<
      Schemas['Municipality'][]
    >();
  });
});
