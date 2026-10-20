## Context

US05 a US07 dejaron los cursos con alta, listado y edición: `courses` y `classes` (con `classes.course_id ON DELETE CASCADE`), `coursesRouter` con `requireAuthentication` para `ADMIN` y `MEMBER`, `parseCourseId` (un id que no es UUID es `404` sin llegar a la base de datos), `CourseNotFound` y la edición, que bloquea la fila del curso con `FOR UPDATE`. El listado de `/cursos` tiene la columna «Acciones» con el enlace «Editar» y la página de edición ya muestra «Este curso no existe o ya no está disponible» con un `404`. Falta poder borrar un curso (proposal.md).

Restricciones: el _pooler_ de Supabase en modo transacción (bloqueos de fila sí, de sesión no), el colegio siempre de la identidad, contrato primero, y los alumnos todavía no existen (US14): el número de alumnos del impacto vale `0` hasta entonces.

## Goals / Non-Goals

**Goals:**

- Un borrado real del curso y sus clases, atómico y serializado con la edición.
- Un diálogo que informe antes del impacto (clases y, cuando existan, alumnos) y confirme una sola vez.
- Un contrato que ya lleva `studentCount`, para que US14 solo cambie cómo se calcula.

**Non-Goals:**

- Papelera o restauración, horarios y tutores en el impacto, segundas confirmaciones, límite de borrados, borrado en lote, migraciones.

## Decisions

### D1. Un endpoint de impacto, no leerlo del listado

`GET /api/courses/{id}/impact` devuelve `{ impact: { classCount, studentCount } }`. El listado ya trae las clases, pero no los alumnos (ni los traerá: el listado no necesita contarlos), y el dato del diálogo debe ser el del momento de abrirlo. Alternativas descartadas: contar las clases en el navegador (no sirve para los alumnos) y añadir `studentCount` a cada curso del listado (encarece el listado para un dato que solo usa el diálogo).

### D2. `DELETE` responde `200` con lo borrado, no `204`

`{ deleted: { classCount, studentCount } }`, contado dentro de la misma transacción que borra. El aviso «Curso «X» eliminado» (y, con alumnos, cuántos quedan sin clase) usa ese dato y no el del diálogo, que pudo cambiar entre la apertura y la confirmación. Es también lo que se registra en `COURSE_DELETED`. Alternativa descartada: `204` sin cuerpo (el aviso tendría que fiarse del impacto ya viejo).

### D3. El impacto como tipo del dominio y el recuento de alumnos en el repositorio

`domain/course/courseImpact.ts` define `CourseImpact { classCount, studentCount }`. El puerto gana `impactOf(schoolId, courseId): Promise<CourseImpact | null>` y `delete(schoolId, courseId): Promise<CourseImpact | null>` (`null`: el curso no está en el colegio). `PrismaCourseRepository` devuelve hoy `studentCount: 0` con un comentario que apunta a US14, que lo sustituirá por un recuento real; ningún otro código sabe que es constante. Los casos de uso (`GetCourseDeletionImpact`, `DeleteCourse`) traducen `null` a `CourseNotFound`.

### D4. Borrar en una transacción con la fila del curso bloqueada

`delete` abre un `$transaction` interactivo: `SELECT id FROM courses WHERE id = … AND school_id = … FOR UPDATE` (`$queryRaw`, como `update`); sin fila, devuelve `null`. Después cuenta las clases, borra el curso (`course.delete`) y deja que la base de datos borre las clases por la cascada. Con el bloqueo, un `PUT` simultáneo del mismo curso espera: si el borrado confirma primero, el `SELECT … FOR UPDATE` del `PUT` (en `READ COMMITTED`, PostgreSQL vuelve a evaluar la fila) no encuentra nada y responde `404`; si el `PUT` va primero, el borrado cuenta el estado final. Dos borrados simultáneos dan un `200` y un `404` por la misma razón. Alternativas descartadas: un `deleteMany` sin bloqueo (el recuento y el borrado podrían ver estados distintos) y borrar las clases a mano (la cascada ya existe y es atómica).

### D5. Rutas

`GET /:id/impact` y `DELETE /:id` en `coursesRouter`, con el mismo `parseCourseId`. Sin cuerpo en el `DELETE`. El impacto no registra nada; el borrado registra `COURSE_DELETED` (`school_id`, `actor_id`, `course_id`, `class_count`, `student_count`) tras la transacción, nunca nombres. Un `404` no registra (como en la edición).

### D6. Frontend: el diálogo hace sus propias peticiones

`components/DeleteCourseModal.tsx` recibe `course: { id, name } | null` (`show` es `course !== null`; guarda el último para que el contenido no desaparezca durante la animación de cierre), `onDeleted(course, deleted)`, `onGone()`, `onCancel()` y `onExited()`. Él mismo pide el impacto (`coursesService.getImpact`) y borra (`coursesService.delete`) con `authorizedFetch`, con una `ref` del curso ya pedido (por `StrictMode`) y otra de «borrando» contra la doble pulsación. Así `CoursesPage` solo decide qué hacer con el resultado. Se sigue el patrón de `ConfirmSuspendModal`: siempre montado, `autoFocus` en «Cancelar», sin «X» de cabecera, título como nombre del diálogo (`aria-labelledby`). Mientras borra, `onHide` no hace nada (Escape y el clic fuera no cierran a mitad).

### D7. Frontend: la página quita la fila y lleva el foco

Con `onDeleted`, `CoursesPage` quita el curso de la lista cargada (sin volver a pedirla), guarda un aviso propio «Curso «X» eliminado» (estado de la página, no de la navegación, que tiene prioridad sobre el de llegada) y, en `onExited` del diálogo, pone el foco en el `h1` (`tabIndex={-1}`) un turno después (`setTimeout` de 0 ms): react-bootstrap suelta la captura de foco del diálogo justo después de `onExited`, y enfocar en ese mismo instante deja que su comprobación pendiente devuelva el foco al diálogo que desaparece. La fila del botón ya no existe y el `restoreFocus` de react-bootstrap no tiene a dónde volver. Al cancelar, ese `restoreFocus` devuelve el foco al botón «Borrar» de la fila. Con `onGone` (un `404`), cierra el diálogo, muestra «Ese curso ya no existe» y vuelve a pedir la lista (el mismo mecanismo que «Reintentar»). El botón «Borrar» es un `Button` `outline-danger` `size="sm"` con `aria-label` «Borrar {nombre}».

### D8. Textos

`courses.delete.*` con los plurales de i18next (`classes_one`/`_other`, `students_one`/`_other`, `deletedStudents_one`/`_other`), el título, «Esta acción no se puede deshacer», los botones, «Borrando…», «Cargando…», los errores y los avisos. `courses.actions.delete` y `deleteCourse` para el botón.

## Risks / Trade-offs

- [Borrado irreversible por error] → El diálogo informa y empieza en «Cancelar»; no hay «deshacer». Una papelera sería otra historia.
- [El impacto envejece entre abrir y confirmar] → El `DELETE` cuenta y devuelve lo borrado de verdad; no se bloquea el borrado por una diferencia.
- [`studentCount` constante] → Documentado en el contrato y en la nota de US14; los tests del frontend prueban la línea de alumnos con un impacto simulado.
- [Los tests que esperan cero botones en el listado] → Se actualizan: el botón «Borrar» es nuevo y esperado.
- [Foco tras borrar] → Se pone en `onExited`, después de que react-bootstrap intente restaurarlo (a un botón ya retirado); se prueba con Testing Library.

## Migration Plan

Sin migración. Despliegue normal desde `main` (CI, `prisma migrate deploy` sin migraciones nuevas, smoke test). Vuelta atrás: revertir la PR; no hay esquema que deshacer, pero los cursos borrados no vuelven (es un borrado real).

## Open Questions

Ninguna: borrado real, impacto con `studentCount` preparado y una sola confirmación están validados (ficha de US08).
