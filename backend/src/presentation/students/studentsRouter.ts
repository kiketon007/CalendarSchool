import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateStudent } from '../../application/students/createStudent.js';
import type { DeleteStudent } from '../../application/students/deleteStudent.js';
import type { GetStudent } from '../../application/students/getStudent.js';
import type { ListStudents } from '../../application/students/listStudents.js';
import type { UpdateStudent } from '../../application/students/updateStudent.js';
import { StudentNotFound } from '../../domain/student/studentErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { sendSuccess } from '../http/responses.js';

export interface StudentsRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createStudent: Pick<CreateStudent, 'execute'>;
  listStudents: Pick<ListStudents, 'execute'>;
  getStudent: Pick<GetStudent, 'execute'>;
  updateStudent: Pick<UpdateStudent, 'execute'>;
  deleteStudent: Pick<DeleteStudent, 'execute'>;
  logger: Logger;
}

const studentIdSchema = z.uuid();

/**
 * Valida el identificador de la ruta antes de llegar al caso de uso: uno que no es un UUID es un alumno
 * que no existe (`404`), igual que uno de otro colegio.
 */
function parseStudentId(value: unknown): string {
  const parsed = studentIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new StudentNotFound();
  }
  return parsed.data;
}

/**
 * Rutas de los alumnos del colegio bajo `/api/students`: crear uno y listar los del colegio (US14), leer y editar uno por su id (US17) y borrarlo (US18).
 * Las pueden usar los dos roles, así que solo exigen sesión (sin `requireRole`). Se autentican con el access
 * token y no con cookies, así que no usan `requireAllowedOrigin`. El colegio y quien actúa salen siempre
 * de la identidad leída de la base de datos, nunca de la petición.
 */
export function studentsRouter({
  authenticateRequest,
  createStudent,
  listStudents,
  getStudent,
  updateStudent,
  deleteStudent,
  logger,
}: StudentsRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.post('/', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El caso de uso valida el cuerpo; aquí solo se reenvía tal como llegó.
    const student = await createStudent.execute({ schoolId, actorId, body: req.body });
    sendSuccess(res, { student }, 201);
  });

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const students = await listStudents.execute({ schoolId });
    sendSuccess(res, { students });
  });

  router.get('/:id', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const student = await getStudent.execute({
      schoolId,
      studentId: parseStudentId(req.params.id),
    });
    sendSuccess(res, { student });
  });

  router.put('/:id', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El id se valida antes que el cuerpo; el caso de uso valida el cuerpo.
    const student = await updateStudent.execute({
      schoolId,
      actorId,
      studentId: parseStudentId(req.params.id),
      body: req.body,
    });
    sendSuccess(res, { student });
  });

  router.delete('/:id', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const deleted = await deleteStudent.execute({
      schoolId,
      actorId,
      studentId: parseStudentId(req.params.id),
    });
    sendSuccess(res, { deleted });
  });

  return router;
}
