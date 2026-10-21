## Why

Desde US09 cada clase puede tener un tutor, pero solo se asigna al crear el profesor: la edición del curso muestra el tutor como texto y no hay forma de cambiarlo, quitarlo ni de asignar uno a un profesor que ya existe. US09_b (`docs/User_Stories_MVP.md`, ficha enriquecida) completa la tutoría desde la pantalla del curso, donde se organizan las clases (PRD §3.4: el tutor de la clase es opcional y un profesor tutoriza una sola).

## What Changes

- **Contrato:** `UpdateClassRequest` (cuerpo de `PUT /api/courses/{id}`) gana `tutorId`, opcional: omitido = sin cambios, `null` = quitar, un UUID = asignar; vale también en las clases nuevas. Código nuevo `PROFESSOR_ALREADY_TUTOR` (`409`). Errores de campo `classes[<i>].tutorId` con `INVALID_FORMAT`, `NOT_FOUND` y `DUPLICATE`. `POST /api/courses` no cambia.
- **Backend:** el parser del `PUT` valida `tutorId`; `planCourseUpdate` calcula también los cambios de tutor con los profesores pedidos (los que existen en el colegio y la clase que tutorizan) y rechaza un profesor de otro curso; el repositorio escribe los tutores en dos fases (primero quita y después asigna) dentro de la transacción de la edición con el curso bloqueado, y traduce la violación de `classes_tutor_id_key` a `PROFESSOR_ALREADY_TUTOR`. `COURSE_UPDATED` suma `tutors_changed` y `COURSE_UPDATE_REJECTED` dos motivos nuevos.
- **Frontend:** la edición del curso pide los profesores y `CourseForm` gana un desplegable «Tutor» por fila con «Sin tutor», los profesores sin clase y los que tutorizan clases de este curso; el tutor cuenta como cambio y viaja en el `PUT`; el mismo profesor en dos filas es un error; un `409` avisa, recarga los profesores y marca la fila. Si los profesores no cargan, el tutor se queda de solo lectura (como en US09) y se puede guardar el resto.

**Fuera de alcance:** mover a un profesor que tutoriza una clase de **otro curso** (no se ofrece y, si llega, `409`), elegir el tutor al crear un curso, avisar de que el tutor cambió mientras se editaba (gana el último guardado, como en US07), la clase del profesor en su propia ficha (US12), y borrar profesores (US13). Sin cambios en el modelo de datos: `classes.tutor_id` ya existe (US09).

## Capabilities

### New Capabilities

_Ninguna._

### Modified Capabilities

- `school-courses`: el contrato del `PUT /api/courses/{id}` admite `tutorId` por clase; la edición asigna, cambia, mueve, intercambia y quita tutores en un solo guardado, con sus validaciones y su concurrencia; la página de edición ofrece el desplegable de tutor por fila, con su accesibilidad, su comportamiento sin profesores y el `409`; el E2E lo cubre.
- `api-error-handling`: el código `PROFESSOR_ALREADY_TUTOR`.

## Impact

- **Contrato:** `docs/api-spec.yml` (`UpdateClassRequest.tutorId`, el `409` del `PUT` y el código nuevo) y `frontend/src/api/generated/schema.ts`.
- **Backend:** `application/courses/updateCourseRequest.ts` y `updateCourse.ts`; `domain/course/courseUpdate.ts`, `courseRepository.ts` y `courseErrors.ts`; `infrastructure/prisma/prismaCourseRepository.ts`; `presentation/http/appError.ts` y `errorHandler.ts`; `test-fixtures/course-fields.json`.
- **Frontend:** `components/CourseForm.tsx`, `pages/EditCoursePage.tsx`, `validation/courseValidation.ts`, `services/coursesService.ts`, `es.json` y `en.json`; E2E en `cypress/e2e/`.
- **Datos, infraestructura y dependencias:** sin cambios (sin migración).
- **Documentación:** estándares, `CLAUDE.md` (los tres), `README.md`, `MODELO_DATOS.md`, la arquitectura y las notas de US12 y US13. La ficha de US09_b ya está actualizada en este cambio.
