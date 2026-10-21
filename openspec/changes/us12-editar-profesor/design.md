## Context

- **Backend:** un profesor es `Professor` (`domain/professor/professor.ts`) y la relación de tutoría vive en `classes.tutor_id` (nulo, **único** por `classes_tutor_id_key`, `ON DELETE SET NULL`). `PrismaProfessorRepository.create` asigna la clase con un `updateMany` condicionado a que esté libre. El puerto `ProfessorRepository` tiene `create` y `listBySchool`. `professorsRouter` monta `POST /` y `GET /`. Los cursos ya tienen el patrón de lectura y edición por id (`parseCourseId` → `CourseNotFound` → `404`, `FOR UPDATE` con `$queryRaw`, `violatedUniqueIndex` para traducir carreras).
- **Frontend:** `CreateProfessorPage` contiene todo el formulario (321 líneas): campos, validación (`validateProfessor`, `professor-fields.json`), el desplegable de clases libres agrupadas por curso (de `coursesService.list`, que ya trae el tutor de cada clase), la guarda del doble envío y el manejo de `400`/`409`/`503`. Los cursos extrajeron `CourseForm` de su página de creación al llegar la edición (US07), con `initialValues` y `requireChanges`.
- Decisiones de producto (ficha de US12): página propia, cualquier clase moviendo al tutor, gana el último guardado, «Cancelar» sin preguntar, sin asignaturas.

## Goals / Non-Goals

**Goals:**

- Leer y editar un profesor por id con el mismo aislamiento por colegio y el mismo `404` indistinguible que los cursos.
- Mover la tutoría (también quitándosela a otro profesor) de forma atómica y segura frente a concurrencia.
- Un único formulario para crear y editar, sin cambiar el comportamiento de la creación.

**Non-Goals:**

- Control de versión (`updatedAt` en el `PUT`), confirmación al cancelar, asignaturas, borrado.
- Cambiar la regla de la creación (solo clases libres) o la edición del curso (US09_b).

## Decisions

### 1. Contrato: `PUT` con el estado final y `classId` de tres estados

`UpdateProfessorRequest { firstName, lastName, position?: Position | null, classId?: uuid | null }`. `position` ausente = `null` (el formulario siempre lo envía); `classId` ausente = no tocar la tutoría (para cuando el frontend no pudo cargar los cursos, como `tutorId` ausente en US09_b). La respuesta es `{ professor, replacedTutor }` para que la página pueda nombrar al profesor desplazado sin otra petición. No hay códigos nuevos: `NOT_FOUND`, `VALIDATION_ERROR` y `PROFESSOR_ALREADY_TUTOR` (solo ante una carrera con el índice) ya existen.

*Alternativa descartada:* `PATCH` con solo los campos que cambian. Obligaría a distinguir «ausente» de «sin cambios» en todos los campos; el estado final es lo que hace el resto de la API (US07).

### 2. Validación compartida con la creación

`parseUpdateProfessorRequest` reutiliza los esquemas de `createProfessorRequest.ts` (nombre y apellidos con `USER_FIELD_SCHEMAS` tras `cleanName`, cargo y `classId` UUID) y solo cambia que `classId` ausente sea distinto de `null`. `professor-fields.json` se recorre también contra el parser de edición.

### 3. Puerto: `findById` y `update` devuelven `null` para «no está en el colegio»

```ts
findById(schoolId, professorId): Promise<Professor | null>;
update(schoolId, professorId, changes: ProfessorChanges): Promise<ProfessorUpdate | null>;
// ProfessorChanges: { firstName, lastName, position, classId?: string | null }
// ProfessorUpdate: { before: Professor; after: Professor; replacedTutor: ProfessorName | null }
```

El caso de uso convierte `null` en `ProfessorNotFound` (`404`), como `CourseRepository.delete` (US08). `before` y `after` salen de la misma transacción y permiten calcular `changed_fields` para el log sin una lectura aparte.

### 4. La transacción de `update`

En un `$transaction` interactivo:

1. `SELECT id FROM professors WHERE id = $1 AND school_id = $2 FOR UPDATE` (`$queryRaw`): sin fila → `null`. Dos ediciones del mismo profesor van de una en una.
2. Leer el estado actual (`before`) con `PROFESSOR_FIELDS`.
3. Si `classId` es un UUID distinto de la clase actual: `SELECT id, tutor_id FROM classes c JOIN courses … WHERE c.id = $1 AND courses.school_id = $2 FOR UPDATE`; sin fila → `ClassNotFound` (deshace todo). Bloquear la clase destino hace que dos ediciones que la quieren vayan de una en una y que la segunda vea el tutor que dejó la primera (y lo desplace: gana el último).
4. `professor.update` con nombre, apellidos y cargo.
5. Si la tutoría cambia, en este orden (el índice único no es diferible): `schoolClass.updateMany({ where: { tutorId: professorId }, data: { tutorId: null } })` (libera la propia) y, si hay clase nueva, `schoolClass.update({ where: { id }, data: { tutorId: professorId } })`; el tutor anterior de esa clase (leído en el paso 3) es `replacedTutor` si no es `null` ni el propio profesor.
6. Leer `after` y el nombre de `replacedTutor`.

Una violación de `classes_tutor_id_key` (otra escritura que no comparte estos bloqueos, como la edición de un curso que asigna a este profesor a la vez) se traduce con `violatedUniqueIndex` a `ProfessorAlreadyTutor` → `409 PROFESSOR_ALREADY_TUTOR`, y la transacción se deshace entera.

*Alternativa descartada:* el `updateMany` condicionado de la creación (`tutorId: null`). Con «mover al tutor» la clase destino puede estar ocupada a propósito, así que la condición no sirve; el bloqueo explícito de la clase es lo que serializa.

*Alternativa descartada:* reutilizar `planCourseUpdate` (US09_b). Planifica los tutores de un curso entero; aquí cambia una sola relación de un profesor y el plan sería más complejo que los dos `UPDATE`.

### 5. Casos de uso y router

- `GetProfessor.execute({ schoolId, professorId })` → `Professor` o `ProfessorNotFound`.
- `UpdateProfessor.execute({ schoolId, actorId, professorId, body })`: valida, llama a `update`, traduce `null` a `ProfessorNotFound`, `ClassNotFound` a `ValidationError([{ field: 'classId', code: 'NOT_FOUND' }])`, y registra `PROFESSOR_UPDATED` (solo si `changed_fields` no está vacío) o `PROFESSOR_UPDATE_REJECTED`.
- `professorsRouter`: `GET /:id` y `PUT /:id` con `parseProfessorId` (UUID con `z.uuid()`, si no `ProfessorNotFound`), `Cache-Control: no-store` en la lectura.
- `errorHandler`: `ProfessorNotFound` → `404 NOT_FOUND`.

### 6. Frontend: extraer `ProfessorForm`

`components/ProfessorForm.tsx` recibe `initialValues` (`{ firstName, lastName, position, classId }`), `courses` (estado de carga de los cursos: `loading`, `loaded` con los cursos, `error`), `classMode` (`'free'` en la creación: solo clases libres, como hoy; `'any'` en la edición: todas, las de otro tutor con «· tutor: Nombre» y el aviso al elegirlas), `requireChanges`, `onSubmit` (devuelve un resultado: `done`, `validationError` con campos, `classTaken` —solo creación—, `failed`) y textos (título, aviso general). Contiene los campos, la validación, el foco, la guarda síncrona y la marca de errores. `CreateProfessorPage` queda como una página fina que pide los cursos y llama a `create`; sus tests siguen pasando sin cambiar de comportamiento.

`hasProfessorChanges(initial, current)` en `validation/professorValidation.ts` compara nombres limpios, cargo y clase.

*Alternativa descartada:* duplicar el formulario en la página de edición. Repetiría validación, foco y guarda; el precedente de `CourseForm` muestra que extraerlo al llegar la edición es lo que mantiene las dos iguales.

### 7. `EditProfessorPage`

Pide `professorsService.get` y `coursesService.list` una sola vez cada uno (refs como `EditCoursePage`). Estados: cargando, no disponible (`404`), error con «Reintentar», o el formulario. Con cursos no disponibles, `ProfessorForm` desactiva la clase y el `onSubmit` de la página no envía `classId`. Con el `200`, `navigate('/profesores', { replace: true, state: { professorUpdated: nombre, replacedTutor?: nombre } })`. Un `404` al guardar muestra la vista de no disponible. `ProfessorsPage` lee el aviso con una guarda de tipo (como `noticeFrom` en `CoursesPage`) y añade la columna «Acciones» con un `Link` «Editar» por fila y por tarjeta (`aria-label` «Editar {Apellido, Nombre}»).

## Risks / Trade-offs

- [Quitar una tutoría sin querer] → la opción muestra el tutor actual, el aviso aparece antes de guardar y el aviso del listado nombra al profesor afectado; el evento lleva `replaced_tutor`.
- [Extraer `ProfessorForm` rompe la creación] → los tests de `CreateProfessorPage` y el E2E de US09 se ejecutan sin cambios como red de seguridad; la extracción va en su propia tarea antes de la edición.
- [Carrera con la edición de un curso que asigna al mismo profesor] → el índice único lo detiene y se responde `409` con todo deshecho; el frontend lo trata como error general y se puede reintentar.
- [Interbloqueo entre dos ediciones que cruzan clases (Ana pide la clase de Luis y Luis la de Ana a la vez)] → el orden de bloqueo es siempre profesor y después clase destino, y la clase propia se libera con un `UPDATE` que también espera; PostgreSQL detecta el interbloqueo y aborta una de las dos. Se cubre con un test de integración de ediciones cruzadas simultáneas; la que aborta debe responder un error controlado (`409` o `503`, nunca `500`) y no dejar nada a medias. Cómo se traduce exactamente se decide en la tarea de infraestructura con el resultado del test.

## Migration Plan

Sin migraciones. Despliegue normal (backend en Lambda y frontend en S3); la creación no cambia de contrato. Para volver atrás basta con revertir el commit.

## Open Questions

Ninguna de producto. A comprobar en la implementación: si el test de ediciones cruzadas produce un interbloqueo real y a qué código se traduce (ver riesgos); si cambia el contrato, se actualizan antes la spec y `api-spec.yml`.
