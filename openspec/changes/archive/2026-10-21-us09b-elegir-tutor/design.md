## Context

US09 dejó `professors` y `classes.tutor_id` (nulo, **único** `classes_tutor_id_key`, `ON DELETE SET NULL`), el tutor de cada clase en todas las lecturas de cursos (`TUTOR_FIELDS`) y la asignación de una clase solo al crear el profesor (`PrismaProfessorRepository.create`, con un `UPDATE` condicionado). La edición de un curso (US07) es un `PUT` con el estado final, un parser (`parseUpdateCourseRequest`), una función pura (`planCourseUpdate(current, requested)`) y `PrismaCourseRepository.update(schoolId, courseId, requested, plan)`, que bloquea la fila del curso (`FOR UPDATE`), lee las clases, ejecuta el plan y escribe nombre → borrar → renombrar en dos fases → crear. Hoy el parser ignora cualquier `tutorId` y el plan nunca toca `tutor_id`. En el frontend, `CourseForm` muestra el tutor como texto (`classTutors`) y `CourseDraft` no lo lleva.

Restricciones: el _pooler_ de Supabase en modo transacción (nada de sesión), el colegio siempre de la identidad, contrato primero y compatibilidad con un cliente que no envía `tutorId`. No hay migración: el modelo de datos ya tiene todo.

## Goals / Non-Goals

**Goals:**

- Asignar, cambiar, mover, intercambiar y quitar tutores desde la edición del curso, en el mismo `PUT` y en la misma transacción que el resto de la edición.
- Que un profesor nunca tutorice dos clases, también con ediciones simultáneas de cursos distintos, sin bloqueos nuevos.
- Que el formulario siga sirviendo sin la lista de profesores.

**Non-Goals:**

- Mover a un profesor desde otro curso, elegir el tutor al crear un curso, avisar de un tutor cambiado mientras se editaba, la clase del profesor en su ficha (US12) y borrar profesores (US13).

## Decisions

### D1. Contrato: `tutorId` con tres estados

`UpdateClassRequest.tutorId`: ausente (sin cambios), `null` (quitar) o UUID (asignar). La ausencia significa «no tocar» para que un cliente anterior (o la propia SPA cuando no ha podido cargar los profesores) no borre tutores. Código nuevo `PROFESSOR_ALREADY_TUTOR` (`409` del `PUT`). Los errores de campo usan códigos que ya existen (`INVALID_FORMAT`, `DUPLICATE`, `NOT_FOUND`). Alternativa descartada: un endpoint propio (`PUT /api/classes/{id}/tutor`): más simple de validar, pero un intercambio A↔B serían dos peticiones con un estado intermedio inválido (el mismo profesor en dos clases, que el índice rechaza) y la edición dejaría de ser una sola transacción.

### D2. Parser (aplicación)

`parseUpdateCourseRequest` lee `classes[<i>].tutorId` con tres resultados: `undefined` (ausente), `null` o un UUID en minúsculas; cualquier otra cosa es `INVALID_FORMAT`. El segundo y siguientes con el mismo UUID, `DUPLICATE`. Dentro de una clase, el orden de errores es `id` → `tutorId` → `name` (el parser lee las propiedades propias de la edición antes que el nombre). `UpdateClassInput` y `RequestedClass` ganan `tutorId?: string | null`. La regla vive en `courseFields.ts`/`updateCourseRequest.ts` y la tabla `test-fixtures/course-fields.json` gana el campo `tutorId`, que recorren el backend y el frontend.

### D3. Plan puro con los profesores pedidos (dominio)

`planCourseUpdate(current, requested, tutors)`:

- `current.classes` lleva `tutorId` (lo lee `EDIT_FIELDS`, que ya selecciona el tutor).
- `tutors` es un `ReadonlyMap<string, RequestedTutor>` con los profesores pedidos **que existen en el colegio**: `{ id, tutoredClassId, tutoredCourseId }` (los dos `null` si no tutoriza ninguna).
- Por cada clase pedida con `tutorId !== undefined` distinto del guardado (para una clase nueva, distinto de `null`) se añade `{ classId, tutorId }` a `tutorsChanged`.
- Un `tutorId` que no está en `tutors` → `TutorNotFound(index)` (error de dominio; `UpdateCourse` lo convierte en `ValidationError` con `classes[<i>].tutorId: NOT_FOUND`, como `CreateProfessor` hace con `ClassNotFound`, para que el dominio no dependa de la aplicación).
- Un profesor asignado cuyo `tutoredCourseId` no es este curso → `ProfessorAlreadyTutor`.
- Un profesor asignado que tutoriza una clase de este curso solo es válido si el plan **libera** esa clase: se borra, o se pide con un `tutorId` distinto del suyo (`null` u otro). Si esa clase se pide sin `tutorId`, no se libera → `ProfessorAlreadyTutor`.
- `CourseUpdatePlan` gana `tutorsChanged: readonly { classId, tutorId: string | null }[]`; `isEmptyPlan` lo tiene en cuenta.

El repositorio pasa al plan el estado real, porque lo ejecuta con el curso bloqueado: `plan: (current, tutors) => CourseUpdatePlan`. `ProfessorAlreadyTutor` y `TutorNotFound` van en `domain/course/courseErrors.ts`.

### D4. Escritura de los tutores en dos fases (infraestructura)

Dentro de la transacción actual, tras bloquear el curso y leer las clases: `professor.findMany({ where: { id: { in: pedidos }, schoolId }, select: { id, tutoredClass: { select: { id, courseId } } } })` (una consulta; nada si no se pide ningún `tutorId`). Después del orden de US07 (nombre → borrar → renombrar → crear), los tutores:

1. `updateMany({ where: { courseId, id: { in: clases que cambian y ya existían } }, data: { tutorId: null } })`.
2. Por cada cambio con `tutorId` no nulo, `updateMany({ where: { id: classId, courseId }, data: { tutorId } })`.

La primera fase libera a todos los profesores que se mueven dentro del curso, así que un intercambio A↔B nunca deja el mismo `tutor_id` en dos filas a la vez. Las clases quitadas ya liberaron a su tutor al borrarse (paso de borrar). Alternativas descartadas: una sola fase (un intercambio choca con el índice no diferible); un índice diferible (`DEFERRABLE INITIALLY DEFERRED`), que pediría una migración y no lo modela Prisma, y aun así haría falta saber qué profesores se liberan; `SELECT … FOR UPDATE` de los profesores (no hace falta: el índice único decide).

### D5. Concurrencia y traducción del índice

- Ediciones del mismo curso: ya van de una en una por el bloqueo del curso (US07).
- Dos `PUT` de cursos distintos que asignan al mismo profesor: los dos ven al profesor libre; el segundo choca con `classes_tutor_id_key` al escribir (espera al primero y falla si confirma). El repositorio reconoce la violación por el nombre del índice (`violatedUniqueIndex`, como `COURSE_UNIQUE_INDEX`) y lanza `ProfessorAlreadyTutor`; la transacción ya se deshizo. `409`, nunca `500`.
- `POST /api/professors` con una clase de este curso a la vez que el `PUT`: el alta usa un `UPDATE` condicionado a `tutor_id IS NULL` sobre la fila de la clase; si el `PUT` la asigna primero, el alta da `409 CLASS_ALREADY_HAS_TUTOR`; si el alta confirma primero y el `PUT` también asigna esa clase, el `PUT` la sobrescribe (gana el último que escribe, como el resto de la edición) y el profesor del alta queda sin clase. Si el `PUT` no envía `tutorId` en esa clase, no la toca. Se acepta: es la regla de US07 y la persona ve el resultado al volver al listado.
- Orden de errores: cuerpo (`400`) → curso (`404`) → clase de otro curso (`409 COURSE_CHANGED`, del plan) → profesor (`400 NOT_FOUND`, `409 PROFESSOR_ALREADY_TUTOR`, del plan) → nombre repetido (`409 COURSE_ALREADY_EXISTS`, al escribir el curso) → índice de tutores (`409 PROFESSOR_ALREADY_TUTOR`, al escribir los tutores).

### D6. Caso de uso y eventos

`UpdateCourse` pasa al repositorio `(current, tutors) => planCourseUpdate(current, requested, tutors)`, convierte `TutorNotFound` en `ValidationError` y registra `COURSE_UPDATED` con `tutors_changed: plan.tutorsChanged.length`, y `COURSE_UPDATE_REJECTED` con `reason: "professor_not_found"` o `"professor_already_tutor"`. Sin nombres. `errorHandler` traduce `ProfessorAlreadyTutor` a `409 PROFESSOR_ALREADY_TUTOR`.

### D7. Frontend

- **`EditCoursePage`:** pide el curso y, una sola vez (guarda con `ref`, también con `StrictMode`), `professorsService.list`. Calcula las opciones: «Sin tutor», los profesores con `tutoredClass === null` («Nombre Apellidos») y los que tienen `tutoredClass.courseId === id` («Nombre Apellidos · clase X»), en el orden del servicio. Monta `CourseForm` en cuanto tiene el curso, con `tutorOptions` (`undefined` mientras cargan o si fallan) y `classTutors` para el modo de solo lectura. Si fallan, aviso y «Reintentar»; al cargar, `tutorOptions` llega al formulario ya montado.
- **`CourseForm`:** las filas guardan `tutorId: string | null` desde `initialValues` (las nuevas, `null`). Con `tutorOptions` definido pinta un `Form.Select` por fila (etiqueta visible «Tutor» y `aria-label` «Tutor de la clase N», que contiene la visible) y el `draft` incluye `tutorId` en cada clase; sin él, pinta el texto de solo lectura de US09 y el `draft` no lo incluye. Así, que lleguen las opciones después de montar no pierde lo escrito.
- **`courseValidation.ts`:** `CourseDraft.classes[i].tutorId?: string | null`; `hasCourseChanges` compara el `tutorId` cuando está en los dos; `validateCourse` da `DUPLICATE` en `tutorIds` desde la segunda fila con el mismo profesor; `courseErrorsFromServer` traduce `classes[<i>].tutorId`. `CourseErrors` gana `tutorIds: (FieldErrorCode | undefined)[]`.
- **`coursesService.update`:** envía `tutorId` solo si está en la clase del draft; `409 PROFESSOR_ALREADY_TUTOR` → `professorAlreadyTutor`.
- **`409 PROFESSOR_ALREADY_TUTOR`:** `EditCoursePage` vuelve a pedir los profesores, recalcula las opciones y devuelve al formulario `{ status: 'tutorTaken', availableTutorIds }`. El formulario marca las filas cuyo `tutorId` no es `null` y no está en `availableTutorIds`, lleva el foco a la primera y muestra el aviso general. Si la recarga falla, solo el aviso. Alternativa descartada: que el `409` traiga la fila en `error.details` con un código de campo nuevo: añade un código a `FieldErrorCode` que solo usa este caso, y la recarga hace falta igualmente para que el desplegable deje de ofrecer al profesor.

## Risks / Trade-offs

- [El plan necesita datos de otra tabla (profesores)] → Se los da el repositorio dentro de la transacción como un parámetro más de `plan`; la función sigue siendo pura y se prueba sin base de datos.
- [Un profesor elegido en B sigue en A sin que la persona lo note] → `DUPLICATE` en la segunda fila antes de enviar, sin efectos ocultos; el servidor lo repite (`DUPLICATE` en el cuerpo o `PROFESSOR_ALREADY_TUTOR` si A no se envía).
- [Carrera con el alta de un profesor sobre la misma clase] → Gana el último que escribe (D5), coherente con US07; el alta nunca pisa al `PUT` porque está condicionada.
- [Más escrituras por edición] → Como mucho una consulta de profesores y N + 1 `updateMany` cortos para N tutores cambiados (N ≤ 12), en la transacción existente.
- [La opción de un profesor del curso dice su clase guardada aunque en el formulario se le haya quitado] → Es la etiqueta de lo guardado; el envío decide. Se acepta por simplicidad.

## Migration Plan

Sin migración ni cambios de infraestructura. El cambio de contrato es compatible: un `PUT` sin `tutorId` se comporta como antes. Vuelta atrás: revertir la PR.

## Open Questions

Ninguna.
