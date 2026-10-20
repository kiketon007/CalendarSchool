import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticateRequest } from '../../application/authentication/authenticateRequest.js';
import type { CreateCourse } from '../../application/courses/createCourse.js';
import type { DeleteCourse } from '../../application/courses/deleteCourse.js';
import type { GetCourse } from '../../application/courses/getCourse.js';
import type { GetCourseDeletionImpact } from '../../application/courses/getCourseDeletionImpact.js';
import type { ListCourses } from '../../application/courses/listCourses.js';
import type { UpdateCourse } from '../../application/courses/updateCourse.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { getAuthenticatedUser, requireAuthentication } from '../http/requireAuthentication.js';
import { sendSuccess } from '../http/responses.js';

export interface CoursesRouterDependencies {
  authenticateRequest: Pick<AuthenticateRequest, 'execute'>;
  createCourse: Pick<CreateCourse, 'execute'>;
  listCourses: Pick<ListCourses, 'execute'>;
  getCourse: Pick<GetCourse, 'execute'>;
  updateCourse: Pick<UpdateCourse, 'execute'>;
  getCourseDeletionImpact: Pick<GetCourseDeletionImpact, 'execute'>;
  deleteCourse: Pick<DeleteCourse, 'execute'>;
  logger: Logger;
}

const courseIdSchema = z.uuid();

/** Un id que no es un UUID se trata como un curso inexistente (`404`), sin llegar a la base de datos. */
function parseCourseId(value: unknown): string {
  const parsed = courseIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new CourseNotFound();
  }
  return parsed.data;
}

/**
 * Rutas de los cursos del colegio bajo `/api/courses`: crear un curso con sus clases y listar los del
 * colegio (US05), leer y editar uno (US07) y consultar el impacto de borrarlo y borrarlo (US08). Las pueden usar los dos roles, así que solo exigen sesión (sin `requireRole`). Se
 * autentican con el access token y no con cookies, así que no usan `requireAllowedOrigin`. El colegio y
 * quien actúa salen siempre de la identidad leída de la base de datos, nunca de la petición.
 */
export function coursesRouter({
  authenticateRequest,
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  getCourseDeletionImpact,
  deleteCourse,
  logger,
}: CoursesRouterDependencies): Router {
  const router = Router();

  router.use(requireAuthentication(authenticateRequest, logger));

  router.post('/', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El caso de uso valida el cuerpo; aquí solo se reenvía tal como llegó.
    const course = await createCourse.execute({ schoolId, actorId, body: req.body });
    sendSuccess(res, { course }, 201);
  });

  router.get('/', async (_req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const courses = await listCourses.execute({ schoolId });
    sendSuccess(res, { courses });
  });

  router.get('/:id', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const course = await getCourse.execute({ schoolId, courseId: parseCourseId(req.params.id) });
    sendSuccess(res, { course });
  });

  router.put('/:id', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    // El caso de uso valida el cuerpo; aquí solo se reenvía tal como llegó.
    const course = await updateCourse.execute({
      schoolId,
      actorId,
      courseId: parseCourseId(req.params.id),
      body: req.body,
    });
    sendSuccess(res, { course });
  });

  router.get('/:id/impact', async (req, res) => {
    const { schoolId } = getAuthenticatedUser(res);
    const impact = await getCourseDeletionImpact.execute({
      schoolId,
      courseId: parseCourseId(req.params.id),
    });
    sendSuccess(res, { impact });
  });

  router.delete('/:id', async (req, res) => {
    const { schoolId, userId: actorId } = getAuthenticatedUser(res);
    const deleted = await deleteCourse.execute({
      schoolId,
      actorId,
      courseId: parseCourseId(req.params.id),
    });
    sendSuccess(res, { deleted });
  });

  return router;
}
