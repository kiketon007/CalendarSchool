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
      | 'NOT_ALLOWED'
      | 'INVALID_RANGE'
      | 'TOO_LONG'
      | 'OVERLAP'
      | 'OUT_OF_RANGE'
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
      studentCount: number;
    }>();
    // Los alumnos del curso sin clase no viajan: son `Course.studentCount` menos la suma de las clases.
    expectTypeOf<Schemas['Course']>().toEqualTypeOf<{
      id: string;
      name: string;
      createdAt: string;
      classes: Schemas['SchoolClass'][];
      studentCount: number;
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
    // Editar un profesor (US12): `position` y `classId` admiten `null`, y `classId` ausente no toca la tutoría.
    expectTypeOf<Schemas['UpdateProfessorRequest']>().toEqualTypeOf<{
      firstName: string;
      lastName: string;
      position?: Schemas['ProfessorPosition'] | null;
      classId?: string | null;
    }>();
    expectTypeOf<Schemas['UpdateProfessorResponse']['data']>().toEqualTypeOf<{
      professor: Schemas['Professor'];
      replacedTutor: Schemas['TutorSummary'] | null;
    }>();
    type GetOne = paths['/api/professors/{id}']['get'];
    type Update = paths['/api/professors/{id}']['put'];
    expectTypeOf<keyof GetOne['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    expectTypeOf<keyof Update['responses']>().toEqualTypeOf<
      200 | 400 | 401 | 404 | 409 | 500 | 503
    >();
    expectTypeOf<'PROFESSOR_ALREADY_TUTOR'>().toExtend<Schemas['ErrorCode']>();
    // Borrar un profesor (US13): sin cuerpo; devuelve la clase que se quedó sin tutor, si tenía.
    type Delete = paths['/api/professors/{id}']['delete'];
    expectTypeOf<keyof Delete['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    expectTypeOf<Schemas['DeleteProfessorResponse']['data']>().toEqualTypeOf<{
      deleted: {
        freedClass: { id: string; name: string; courseName: string } | null;
      };
    }>();
  });

  it('describe the students as protected operations whose list leaves out the sensitive data', () => {
    type Create = paths['/api/students']['post'];
    type List = paths['/api/students']['get'];
    expectTypeOf<keyof Create['responses']>().toEqualTypeOf<201 | 400 | 401 | 500 | 503>();
    expectTypeOf<keyof List['responses']>().toEqualTypeOf<200 | 401 | 500 | 503>();
    expectTypeOf<'NOT_ALLOWED'>().toExtend<Schemas['FieldErrorCode']>();
    // El cuerpo solo declara lo que el cliente decide; la clase, la beca y los textos son opcionales.
    expectTypeOf<Schemas['CreateStudentRequest']>().toEqualTypeOf<{
      firstName: string;
      lastName: string;
      courseId: string;
      classId?: string | null;
      cafeteria: boolean;
      scholarship?: boolean | null;
      foodType?: string | null;
      observations?: string | null;
    }>();
    // El curso y la clase pueden ser `null` (el curso se borró, o el alumno no tiene clase).
    expectTypeOf<Schemas['StudentSummary']>().toEqualTypeOf<{
      id: string;
      firstName: string;
      lastName: string;
      course: Schemas['StudentReference'] | null;
      class: Schemas['StudentReference'] | null;
      cafeteria: boolean;
      scholarship: boolean | null;
    }>();
    // Los datos sensibles solo salen en la respuesta del alta, nunca en el listado.
    expectTypeOf<keyof Schemas['StudentSummary']>().not.toExtend<'foodType' | 'observations'>();
    expectTypeOf<Schemas['Student']>().toEqualTypeOf<{
      id: string;
      firstName: string;
      lastName: string;
      course: Schemas['StudentReference'] | null;
      class: Schemas['StudentReference'] | null;
      cafeteria: boolean;
      scholarship: boolean | null;
      foodType: string | null;
      observations: string | null;
    }>();
    expectTypeOf<Schemas['StudentResponse']['data']>().toEqualTypeOf<{
      student: Schemas['Student'];
    }>();
    expectTypeOf<Schemas['StudentListResponse']['data']>().toEqualTypeOf<{
      students: Schemas['StudentSummary'][];
    }>();
  });

  it('describe reading and editing a student, whose body is the final state of the creation one', () => {
    type GetOne = paths['/api/students/{id}']['get'];
    type Update = paths['/api/students/{id}']['put'];
    expectTypeOf<keyof GetOne['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    expectTypeOf<keyof Update['responses']>().toEqualTypeOf<200 | 400 | 401 | 404 | 500 | 503>();
    // Mismos campos y reglas que el alta: lo que falta o es `null` deja el campo vacío.
    expectTypeOf<Schemas['UpdateStudentRequest']>().toEqualTypeOf<
      Schemas['CreateStudentRequest']
    >();
    // Los dos devuelven el alumno completo, con los datos sensibles que el listado no trae.
    expectTypeOf<GetOne['responses'][200]['content']['application/json']>().toEqualTypeOf<
      Schemas['StudentResponse']
    >();
    expectTypeOf<Update['responses'][200]['content']['application/json']>().toEqualTypeOf<
      Schemas['StudentResponse']
    >();
  });

  it('describe deleting a student, which takes no body and answers with the deleted id', () => {
    type Delete = paths['/api/students/{id}']['delete'];
    expectTypeOf<keyof Delete['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    expectTypeOf<Delete['requestBody']>().toEqualTypeOf<undefined>();
    expectTypeOf<Schemas['DeleteStudentResponse']['data']>().toEqualTypeOf<{
      deleted: { id: string };
    }>();
  });

  it('describe the calendars as operations that anyone reads and only an administrator creates', () => {
    type Create = paths['/api/calendars']['post'];
    type List = paths['/api/calendars']['get'];
    expectTypeOf<keyof Create['responses']>().toEqualTypeOf<
      201 | 400 | 401 | 403 | 409 | 500 | 503
    >();
    expectTypeOf<keyof List['responses']>().toEqualTypeOf<200 | 401 | 500 | 503>();
    expectTypeOf<'CALENDAR_ALREADY_EXISTS'>().toExtend<Schemas['ErrorCode']>();
    expectTypeOf<Schemas['CalendarPeriod']>().toEqualTypeOf<{
      type: 'SESSION' | 'BREAK';
      startTime: string;
      endTime: string;
    }>();
    expectTypeOf<Schemas['CreateCalendarRequest']>().toEqualTypeOf<{
      name: string;
      periods: Schemas['CalendarPeriod'][];
      courseIds?: string[];
    }>();
    expectTypeOf<Schemas['Calendar']>().toEqualTypeOf<{
      id: string;
      name: string;
      periods: Schemas['CalendarPeriod'][];
      courses: { id: string; name: string }[];
      createdAt: string;
    }>();
    expectTypeOf<Schemas['CalendarResponse']['data']>().toEqualTypeOf<{
      calendar: Schemas['Calendar'];
    }>();
    expectTypeOf<Schemas['CalendarListResponse']['data']>().toEqualTypeOf<{
      calendars: Schemas['Calendar'][];
    }>();
  });

  it('describe reading and editing one calendar, which only an administrator edits', () => {
    type Get = paths['/api/calendars/{id}']['get'];
    type Update = paths['/api/calendars/{id}']['put'];
    expectTypeOf<keyof Get['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    expectTypeOf<keyof Update['responses']>().toEqualTypeOf<
      200 | 400 | 401 | 403 | 404 | 409 | 500 | 503
    >();
    expectTypeOf<Update['requestBody']['content']['application/json']>().toEqualTypeOf<
      Schemas['UpdateCalendarRequest']
    >();
    expectTypeOf<Schemas['UpdateCalendarRequest']>().toEqualTypeOf<{
      name: string;
      periods: Schemas['CalendarPeriod'][];
      courseIds?: string[];
    }>();
    expectTypeOf<Get['responses'][200]['content']['application/json']>().toEqualTypeOf<
      Schemas['CalendarResponse']
    >();
    expectTypeOf<Update['responses'][200]['content']['application/json']>().toEqualTypeOf<
      Schemas['CalendarResponse']
    >();
  });

  it('describe deleting a calendar, which takes no body and answers with the deleted id and the freed courses', () => {
    type Delete = paths['/api/calendars/{id}']['delete'];
    expectTypeOf<keyof Delete['responses']>().toEqualTypeOf<200 | 401 | 403 | 404 | 500 | 503>();
    expectTypeOf<Delete['requestBody']>().toEqualTypeOf<undefined>();
    expectTypeOf<Schemas['DeleteCalendarResponse']['data']>().toEqualTypeOf<{
      deleted: { id: string; courseCount: number };
    }>();
  });

  it('describe the subjects as operations that anyone reads and only an administrator creates', () => {
    type Create = paths['/api/subjects']['post'];
    type List = paths['/api/subjects']['get'];
    expectTypeOf<keyof Create['responses']>().toEqualTypeOf<
      201 | 400 | 401 | 403 | 409 | 500 | 503
    >();
    expectTypeOf<keyof List['responses']>().toEqualTypeOf<200 | 401 | 500 | 503>();
    expectTypeOf<'SUBJECT_ALREADY_EXISTS'>().toExtend<Schemas['ErrorCode']>();
    expectTypeOf<'SUBJECT_CODE_ALREADY_EXISTS'>().toExtend<Schemas['ErrorCode']>();
    expectTypeOf<Schemas['SubjectType']>().toEqualTypeOf<'CORE' | 'ELECTIVE' | 'CUSTOM'>();
    expectTypeOf<Schemas['SubjectStatus']>().toEqualTypeOf<'ACTIVE' | 'INACTIVE'>();
    expectTypeOf<Schemas['SubjectColor']>().toEqualTypeOf<
      | 'blue'
      | 'indigo'
      | 'purple'
      | 'pink'
      | 'red'
      | 'orange'
      | 'yellow'
      | 'green'
      | 'teal'
      | 'cyan'
      | 'brown'
      | 'gray'
    >();
    // El cuerpo solo declara lo que el cliente decide: ni el colegio ni la fecha de alta.
    expectTypeOf<Schemas['CreateSubjectRequest']>().toEqualTypeOf<{
      name: string;
      code?: string | null;
      type: Schemas['SubjectType'];
      status: Schemas['SubjectStatus'];
      description?: string | null;
      color: Schemas['SubjectColor'];
      courses: { courseId: string; sessionsPerWeek: number }[];
    }>();
    expectTypeOf<Schemas['SubjectCourse']>().toEqualTypeOf<{
      id: string;
      name: string;
      sessionsPerWeek: number;
    }>();
    expectTypeOf<Schemas['Subject']>().toEqualTypeOf<{
      id: string;
      name: string;
      code: string | null;
      type: Schemas['SubjectType'];
      status: Schemas['SubjectStatus'];
      description: string | null;
      color: Schemas['SubjectColor'];
      courses: Schemas['SubjectCourse'][];
      createdAt: string;
    }>();
    expectTypeOf<Schemas['SubjectResponse']['data']>().toEqualTypeOf<{
      subject: Schemas['Subject'];
    }>();
    expectTypeOf<Schemas['SubjectListResponse']['data']>().toEqualTypeOf<{
      subjects: Schemas['Subject'][];
    }>();
  });

  it('describe reading and editing one subject, which only an administrator edits', () => {
    type Get = paths['/api/subjects/{id}']['get'];
    type Update = paths['/api/subjects/{id}']['put'];
    expectTypeOf<keyof Get['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    expectTypeOf<keyof Update['responses']>().toEqualTypeOf<
      200 | 400 | 401 | 403 | 404 | 409 | 500 | 503
    >();
    expectTypeOf<Update['requestBody']['content']['application/json']>().toEqualTypeOf<
      Schemas['UpdateSubjectRequest']
    >();
    // Es el estado final: la misma forma que el alta.
    expectTypeOf<Schemas['UpdateSubjectRequest']>().toEqualTypeOf<
      Schemas['CreateSubjectRequest']
    >();
    expectTypeOf<Get['responses'][200]['content']['application/json']>().toEqualTypeOf<
      Schemas['SubjectResponse']
    >();
    expectTypeOf<Update['responses'][200]['content']['application/json']>().toEqualTypeOf<
      Schemas['SubjectResponse']
    >();
  });

  it('describe deleting a subject, which takes no body and answers with the deleted id', () => {
    type Delete = paths['/api/subjects/{id}']['delete'];
    expectTypeOf<keyof Delete['responses']>().toEqualTypeOf<200 | 401 | 403 | 404 | 500 | 503>();
    expectTypeOf<Delete['requestBody']>().toEqualTypeOf<undefined>();
    expectTypeOf<Delete['responses'][200]['content']['application/json']>().toEqualTypeOf<
      Schemas['DeleteSubjectResponse']
    >();
    expectTypeOf<Schemas['DeleteSubjectResponse']['data']>().toEqualTypeOf<{
      deleted: { id: string };
    }>();
  });

  it('describe the workload of a course, which only an administrator changes', () => {
    type Get = paths['/api/courses/{id}/workload']['get'];
    type Patch = paths['/api/courses/{id}/workload']['patch'];
    expectTypeOf<keyof Get['responses']>().toEqualTypeOf<200 | 401 | 404 | 500 | 503>();
    expectTypeOf<keyof Patch['responses']>().toEqualTypeOf<
      200 | 400 | 401 | 403 | 404 | 500 | 503
    >();
    expectTypeOf<Get['responses'][200]['content']['application/json']>().toEqualTypeOf<
      Schemas['CourseWorkloadResponse']
    >();
    expectTypeOf<Patch['responses'][200]['content']['application/json']>().toEqualTypeOf<
      Schemas['CourseWorkloadResponse']
    >();
    expectTypeOf<Patch['requestBody']['content']['application/json']>().toEqualTypeOf<
      Schemas['UpdateCourseWorkloadRequest']
    >();
    // Solo viajan las filas que cambian; `null` quita la asignatura del curso.
    expectTypeOf<Schemas['UpdateCourseWorkloadRequest']>().toEqualTypeOf<{
      changes: Schemas['CourseWorkloadChange'][];
    }>();
    expectTypeOf<Schemas['CourseWorkloadChange']>().toEqualTypeOf<{
      subjectId: string;
      sessionsPerWeek: number | null;
    }>();
    expectTypeOf<Schemas['CourseWorkloadSubject']['sessionsPerWeek']>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<Schemas['CourseWorkload']['availableSessions']>().toEqualTypeOf<number | null>();
    expectTypeOf<Schemas['CourseWorkload']['calendar']>().toEqualTypeOf<{
      id: string;
      name: string;
      sessionsPerDay: number;
    } | null>();
    expectTypeOf<Schemas['WorkloadWarningCode']>().toEqualTypeOf<
      'COURSE_WITHOUT_CALENDAR' | 'WORKLOAD_EXCEEDS_SLOTS'
    >();
    expectTypeOf<Schemas['WorkloadWarning']>().toEqualTypeOf<{
      code: Schemas['WorkloadWarningCode'];
      assigned?: number;
      available?: number;
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
