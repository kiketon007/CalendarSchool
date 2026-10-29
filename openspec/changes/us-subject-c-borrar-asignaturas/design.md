## Context

- **US-SUBJECT y US-SUBJECT_b** dejaron `subjects` y `subject_courses` (`ON DELETE CASCADE` hacia la asignatura y hacia el curso), `subjectsRouter` con `requireRole('ADMIN')` en las escrituras antes de `parseSubjectId`, `SubjectNotFound` traducido a `404 NOT_FOUND` con la respuesta reutilizable `SubjectNotFound`, y los bloqueos: el alta toma los cursos `FOR SHARE` en orden de `id`; la edición toma la asignatura `FOR UPDATE` y después la unión de sus cursos y los pedidos `FOR SHARE` en el mismo orden. Hoy nada más referencia a `subjects`. En el frontend, `SubjectsPage` pinta tarjetas con «Editar» para el `ADMIN`, filtros y búsqueda en el navegador y avisos de llegada (`subjectCreated`, `subjectUpdated`).
- **Patrón de borrado:** US08 (cursos), US13 (profesores), US18 (alumnos) y US-BASE_c (calendarios). El borrado es real, responde `200` con lo que se borró (no `204`) y un `404` no deja evento. El más parecido es el de alumnos (US18): el puerto devuelve un booleano, la fila se bloquea `FOR UPDATE` filtrada por colegio y se borra, y el repositorio no lee nada. El diálogo de calendarios (`DeleteCalendarModal`) no pide nada al abrirse porque usa los datos de la tarjeta; la página quita el registro de la lista sin volver a pedirla, muestra un aviso propio (`pageNotice`) con prioridad sobre el de llegada y lleva el foco al `h1` un turno después de `onExited`.
- **Decisiones de producto** (ficha de US-SUBJECT_c, 2026-10-28): se puede borrar una asignatura con cursos (las filas caen en cascada y los cursos no se tocan); el diálogo usa los datos de la tarjeta, **lista los cursos** en los que se imparte y recuerda con **un texto** (sin botón) que se puede inactivar desde «Editar»; la respuesta es `{ deleted: { id } }`.

## Goals / Non-Goals

**Goals:**

- Borrar una asignatura y sus filas de `subject_courses` de forma atómica, solo para `ADMIN`, con el mismo `404` indistinguible que el resto.
- Serializar el borrado con otro borrado y con la edición de la misma asignatura, y no formar ciclos con el borrado de un curso, la edición de un calendario ni el alta.
- Un diálogo inmediato que diga qué se borra y qué alternativa hay, con el patrón de borrado ya conocido.

**Non-Goals:**

- Papelera o deshacer, borrado múltiple, impedir el borrado de una asignatura en uso (no hay usos todavía), borrar desde la página de edición e inactivar desde el diálogo.

## Decisions

### 1. Contrato: `deleteSubject` con `DeleteSubjectResponse` y ningún código nuevo

`DELETE /api/subjects/{id}`, sin cuerpo, responde `200 { deleted: { id } }` y `no-store`; el `id` se devuelve como en `DeleteStudentResponse`, para que el cliente no dependa de lo que envió. El `404` reutiliza `SubjectNotFound`. Alternativa descartada: `204` sin cuerpo; rompería el formato común (`success`/`data`) y obligaría a un caso especial en el cliente. No lleva recuento (a diferencia de los calendarios): no hay nada que se libere ni que el aviso deba contar.

### 2. Dominio y aplicación

- El puerto `SubjectRepository` gana `delete(schoolId, subjectId): Promise<boolean>` (`true` si borró la fila; `false` si no es del colegio o no existe).
- `DeleteSubject` convierte `false` en `SubjectNotFound` **sin registrar nada** y, con éxito, registra `SUBJECT_DELETED` (`school_id`, `actor_id`, `subject_id`) y devuelve `{ id }`. No recibe ni conoce nombres, códigos ni cursos, así que no puede registrarlos. No necesita parser de cuerpo: el `id` lo valida `parseSubjectId` en el router.
- El router monta `requireRole('ADMIN')` en `DELETE /:id` antes de `parseSubjectId`, como el `PUT`: rol → `id` → existencia.

### 3. Transacción y bloqueo en `PrismaSubjectRepository.delete`

Dentro de `$transaction`:

1. `SELECT id FROM subjects WHERE id = $1 AND school_id = $2 FOR UPDATE` (`$queryRaw`, porque hace falta saber si la fila existe). Sin fila, `false` sin tocar nada.
2. `subject.delete({ where: { id } })`: sus filas de `subject_courses` caen por `ON DELETE CASCADE`, nunca a mano.

- **Solo se bloquea la asignatura, no sus cursos.** El borrado no los toca. Contra la **edición** de la misma asignatura (asignatura `FOR UPDATE` → cursos `FOR SHARE`) se serializa por el primer bloqueo: gana quien lo obtiene primero y el otro, al obtenerlo, ve que la fila ya no existe (la edición responde `404`) o que ya está borrada (`false`). Contra el **borrado de un curso** (curso `FOR UPDATE` → cascada sobre las filas de `subject_courses`): el borrado de la asignatura retiene su fila y borra las filas `(asignatura, *)`; el del curso retiene su fila y borra las filas `(*, curso)`. Solo comparten las filas de la pareja `(asignatura, curso)`: quien llega primero la borra y el otro, al esperar, la encuentra ya borrada y sigue. Ninguna de las dos necesita la fila principal que retiene la otra (el borrado de la asignatura no toca el curso, ni el del curso la asignatura), así que la espera es en un solo sentido y no hay ciclo. Un test lo repite varias rondas.
- Contra el **alta** y la **edición de un calendario** no hay relación: el alta solo toma cursos `FOR SHARE` y el calendario toma cursos `FOR UPDATE`, nunca asignaturas.
- **Alternativa descartada:** `deleteMany({ where: { id, schoolId } })` y mirar `count`. Es atómico, pero se aparta del patrón del proyecto y es menos explícito con la edición concurrente.
- La atomicidad se prueba con un disparador `BEFORE DELETE` en `subject_courses` que lanza un error (la cascada falla): la asignatura y sus filas siguen como estaban.

### 4. Ruta

`subjectsRouter` añade `DELETE /:id` con `requireRole('ADMIN')` y `parseSubjectId` y responde `sendSuccess(res, { deleted })`. `requireAuthentication` ya cubre el router; no exige la cabecera `Origin` (Bearer).

### 5. Frontend

- `subjectsService.delete(authorizedFetch, id)` envía `DELETE` sin cuerpo y devuelve `deleted` (con `{ id }`, validado), `notFound`, `forbidden`, `unauthenticated` o `unavailable`; codifica el `id` y nunca lanza.
- `components/DeleteSubjectModal.tsx` sigue a `DeleteCalendarModal`: recibe `subject` (`{ id, name, courses }` o `null`), siempre montado, conserva el último mientras se cierra, no pide nada al abrirse, foco inicial en «Cancelar», sin «X», guarda síncrona (`ref`) contra la doble pulsación, `backdrop="static"` y `keyboard={false}` mientras borra, `404` → `onGone`, otro fallo (también un `403`) → `role="alert"` dentro. Muestra «Se imparte en: …» o «No se imparte en ningún curso», el recordatorio de inactivar como texto plano y «Esta acción no se puede deshacer».
- `SubjectsPage` añade el botón «Borrar» a la tarjeta (junto a «Editar», solo `ADMIN`) y el diálogo. Con `onDeleted` filtra la lista cargada, pone `pageNotice` (prioridad sobre el aviso de llegada) y enfoca el `h1` (`tabIndex={-1}`) un turno después de `onExited`; con `onGone`, aviso y recarga (el mecanismo de reintento existente). Los filtros y la búsqueda viven en el componente y no se tocan: si la asignatura borrada era la única visible, se ve «No hay asignaturas que coincidan»; si era la última del colegio, «Todavía no hay asignaturas» (la lista vacía gana a los filtros, que dejan de pintarse).
- Los estados del diálogo y de la página no necesitan el truco de dos copias de la lista de US18: los filtros de asignaturas son de estado, no de la dirección, y no dependen de opciones calculadas de la lista.

## Risks / Trade-offs

- **[Borrar una asignatura que solo ha dejado de impartirse]** → el diálogo recuerda que se puede inactivar desde «Editar», lista los cursos y pide confirmar. Sin botón: el diálogo no hace un `PUT` (con sus `409` y `400`).
- **[Interbloqueos con la edición y con el borrado de un curso]** → el borrado solo toma la asignatura; tests de concurrencia contra otro borrado, la edición de la misma y el borrado de un curso.
- **[US19 y US-PROF-ASSIGN]** → hoy nada referencia a `subjects`; cuando existan restricciones y asignaciones, esas historias deberán añadir su borrado en cascada o impedir el borrado, y actualizar esta regla.
- **[Foco tras cerrar el diálogo]** → el botón «Borrar» desaparece con la tarjeta; el foco va al `h1` un turno después de `onExited`, comprobado en el E2E con `have.focus` (jsdom no lo reproduce).
- **Seguridad:** el colegio sale de la identidad; el bloqueo filtra por colegio; la escritura exige `ADMIN` antes de leer el `id`; el `404` no distingue una asignatura de otro colegio; el evento no lleva nombres ni códigos.
- **Rendimiento:** una asignatura y como mucho 100 filas de `subject_courses` por la cascada.

## Migration Plan

Sin migraciones. Despliegue normal (el paso `prisma migrate deploy` no aplicará nada). Vuelta atrás: revertir la PR; las asignaturas borradas no se recuperan (es el comportamiento pedido: no hay papelera).

## Open Questions

Ninguna.
