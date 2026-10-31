## ADDED Requirements

### Requirement: Contrato de las asignaciones en OpenAPI
`docs/api-spec.yml` MUST documentar dos operaciones, con seguridad Bearer y el parámetro `id` de los cursos:
- **`GET /api/courses/{id}/assignments`** (`getCourseAssignments`): `200` (`no-store`), `401`, `404`, `500` y `503`.
- **`PUT /api/courses/{id}/assignments`** (`updateCourseAssignments`): `200` (`no-store`), `400`, `401`, `404`, `500` y `503`.

Las dos responden con `{ success: true, data: { assignments: CourseAssignments } }`. `CourseAssignments` tiene estos campos:
- `course`: `{ id, name }`;
- `subjects`: `[{ id, name, code, color, status, sessionsPerWeek }]`;
- `classes`: `[{ id, name, tutor: { id, firstName, lastName } | null }]`;
- `assignments`: `[{ subjectId, classId, professorId }]`.

El cuerpo del `PUT` es `UpdateCourseAssignmentsRequest`, `{ assignments: [{ subjectId, classId, professorId }] }`, con un máximo de 2000 entradas.

No hay `403` ni códigos de error nuevos. Los tipos del frontend MUST regenerarse.

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias
- **AND** `api/schema.test.ts` fija las dos operaciones, sus respuestas y los esquemas

### Requirement: Tabla de asignaciones
La base de datos MUST tener `professor_assignments`, con estas columnas:
- `id`: UUIDv7;
- `school_id`: FK a `schools`;
- `professor_id`: FK a `professors`, con `ON DELETE CASCADE`;
- `subject_id`, `course_id` y `class_id`;
- `created_at`.

Claves ajenas compuestas:
- `(subject_id, course_id)` a `subject_courses`, con `ON DELETE CASCADE`;
- `(class_id, course_id)` a `classes (id, course_id)`, con `ON DELETE CASCADE`. Para eso `classes` gana el índice único `classes_id_course_id_key`.

Índices: `UNIQUE (subject_id, class_id)`, para que haya un profesor por asignatura y clase, e índices por `professor_id` y `course_id`.

#### Scenario: Una sola asignación por asignatura y clase
- **WHEN** se inserta directamente una segunda fila con la misma asignatura y clase
- **THEN** la base de datos la rechaza por el índice único

#### Scenario: La clase es del curso
- **WHEN** se inserta directamente una fila con una clase de otro curso
- **THEN** la base de datos la rechaza por la clave ajena `(class_id, course_id)`

#### Scenario: Cascadas
- **WHEN** se borra la fila de `subject_courses` (la asignatura deja de impartirse en el curso), la clase, el curso, la asignatura o el profesor
- **THEN** las asignaciones que dependen de esa fila desaparecen y las demás se conservan

### Requirement: Leer la matriz de un curso con GET
`GET /api/courses/{id}/assignments` MUST responder `200` a un `ADMIN` o un `MEMBER` del colegio con la matriz del curso, sin cambiar nada:
- **`subjects`:** las asignaturas que se imparten en el curso (con fila en `subject_courses`), por nombre con `compareText`, con sus sesiones en el curso y su estado. Las inactivas también aparecen.
- **`classes`:** las clases del curso, por nombre, con su tutor o `null`.
- **`assignments`:** las asignaciones del curso.

Responde `404 NOT_FOUND` en estos casos: un curso de otro colegio, inexistente o con un id que no es UUID (validado en el router). Sin sesión, `401`; con la base de datos caída, `503`.

#### Scenario: Curso con asignaturas y clases
- **GIVEN** 1º Primaria con las clases A (tutora Ana García) y B, y Lengua (5) e Inglés (3)
- **WHEN** se pide su matriz
- **THEN** responde `200` con:
  - las dos asignaturas y sus sesiones;
  - las dos clases, A con su tutora y B con `tutor: null`;
  - `assignments: []`.

#### Scenario: Curso sin asignaturas
- **WHEN** se pide la matriz de un curso sin asignaturas
- **THEN** responde `200` con `subjects: []` y sus clases

### Requirement: Guardar la matriz de un curso con PUT
`PUT /api/courses/{id}/assignments` MUST dejar las asignaciones del curso exactamente como el cuerpo. Lo que no viene en el cuerpo queda sin asignar. Lo hace en una transacción con estos pasos:
1. Bloquea el curso: `SELECT … FROM courses … FOR UPDATE`, filtrado por colegio. Sin fila, responde `404` y no hace nada más.
2. Bloquea con `FOR SHARE` y en orden de `id` los profesores que intervienen: los del cuerpo y los que tenían asignaciones en el curso.
3. Comprueba las referencias.
4. Aplica las **diferencias**: borra lo que sobra, cambia el profesor de lo que cambia (conserva su `created_at`) y crea lo nuevo.
5. Relee la matriz y la devuelve.

Si nada cambia, MUST NOT escribir ni registrar evento. Lo pueden hacer `ADMIN` y `MEMBER`, y gana el último guardado. Dos `PUT` del mismo curso se serializan en su bloqueo.

Errores de campo (`400 VALIDATION_ERROR`), por posición:
- `assignments`: `REQUIRED` si falta o no es una lista, `INVALID_LENGTH` con más de 2000 entradas;
- `assignments[i].subjectId`, `.classId` y `.professorId`: `REQUIRED` o `INVALID_FORMAT` si no es un UUID;
- `NOT_FOUND` en su campo: la asignatura no se imparte en el curso, la clase no es del curso o el profesor no es del colegio;
- `assignments[i]`: `DUPLICATE` desde la segunda entrada con la misma asignatura y clase.

Un curso que no existe gana a los errores de referencia: responde `404`. El colegio sale de la identidad; un `schoolId` en el cuerpo se ignora.

#### Scenario: Asignar y releer
- **WHEN** un `MEMBER` guarda Lengua de A y de B para Ana García e Inglés de A para Eva Ruiz
- **THEN** responde `200` con las tres asignaciones
- **AND** el `GET` devuelve lo mismo

#### Scenario: Estado final
- **GIVEN** Lengua de A asignada a Ana García
- **WHEN** se guarda un cuerpo sin Lengua de A y con Inglés de B para Eva Ruiz
- **THEN** Lengua de A queda sin asignar e Inglés de B queda para Eva Ruiz

#### Scenario: Cambiar de profesor conserva la fila
- **GIVEN** Lengua de A asignada a Ana García
- **WHEN** se guarda con Lengua de A para Luis Pérez
- **THEN** la fila conserva su `created_at` y cambia de profesor

#### Scenario: Sin cambios
- **WHEN** se guarda exactamente lo que ya había
- **THEN** responde `200` sin escribir nada ni registrar `COURSE_ASSIGNMENTS_UPDATED`

#### Scenario: Referencias que no valen
- **WHEN** el cuerpo lleva una asignatura que no se imparte en el curso, una clase de otro curso, un profesor de otro colegio y una pareja repetida
- **THEN** responde `400` con `NOT_FOUND` en `assignments[0].subjectId`, `assignments[1].classId` y `assignments[2].professorId`, y `DUPLICATE` en `assignments[3]`
- **AND** no cambia nada

#### Scenario: Curso inexistente
- **WHEN** se guarda en un curso de otro colegio, inexistente o con un id que no es UUID
- **THEN** responde `404 NOT_FOUND`
- **AND** no cambia nada

#### Scenario: Dos guardados a la vez
- **WHEN** se lanzan en carrera dos `PUT` distintos sobre el mismo curso, en varias rondas
- **THEN** los dos responden `200`
- **AND** queda entero el estado de uno de ellos

#### Scenario: Guardar mientras se borra un profesor
- **WHEN** se lanzan en carrera un `PUT` que asigna a un profesor y el `DELETE` de ese profesor, en varias rondas
- **THEN** no hay `500` ni interbloqueo
- **AND** el `PUT` responde `200` (y la asignación cae con el profesor) o `400` con `NOT_FOUND` en su `professorId`
- **AND** no queda ninguna asignación de un profesor que no existe

### Requirement: Eventos de log de las asignaciones
El `PUT` MUST registrar estos eventos:
- **`COURSE_ASSIGNMENTS_UPDATED`** (`school_id`, `actor_id`, `course_id`, `added`, `removed`, `changed`), solo si algo cambió;
- **`COURSE_ASSIGNMENTS_UPDATE_REJECTED`**, con `reason`: `not_found` (curso) o `invalid_reference`.

Ninguno lleva nombres.

#### Scenario: Evento sin nombres
- **WHEN** se asigna a «Ana García» en «1º Primaria»
- **THEN** el log lleva `COURSE_ASSIGNMENTS_UPDATED` con `added: 1`, sin «Ana», «García» ni «Primaria»

### Requirement: Página de los profesores de un curso
`/cursos/:id/profesores` (`pages/CourseAssignmentsPage.tsx`, `data-testid="course-assignments-page"`) MUST colgar de `AuthenticatedLayout` sin `RequireRole`.

**Carga.** Pide la matriz y los profesores del colegio una vez, aunque `StrictMode` ejecute los efectos dos veces.
- Mientras carga, un `role="status"`.
- Si falla, «Reintentar».
- Ante un `404`, «Este curso no existe o ya no está disponible», con un enlace a «Cursos».
- El título es «Profesores de {curso}».

**Matriz.** Desde 768 px es una tabla:
- **Filas:** cada asignatura con su color (con nombre), su nombre, su código, «Inactiva» si lo está y «{n} sesiones».
- **Columnas:** las clases. En su cabecera, el botón «Asignar al tutor».
- **Cada celda:** un `select` con la etiqueta accesible «Profesor de {asignatura} en {clase}», con «Sin asignar» y los profesores del colegio como «Apellidos, Nombre» por apellidos. El tutor de esa clase lleva «· tutor/a de {clase}».

Por debajo de 768 px, una tarjeta por clase con un `select` por asignatura.

**«Asignar al tutor».** Rellena con el tutor de la clase **solo** las celdas vacías de esa clase. Si la clase no tiene tutor, está deshabilitado y lo explica (ligado por `aria-describedby`).

**Recuentos,** recalculados mientras se edita:
- «Sin profesor: {n} de {m}», en rojo y con texto si n > 0;
- «En este curso: {Apellidos, Nombre} {k} sesiones · …», con la suma de las sesiones de sus celdas.

**Curso sin asignaturas.** Se explica, con un enlace a `/cursos/{id}/carga`.

**«Guardar».**
- Solo se habilita con diferencias, con una guarda síncrona contra el doble envío.
- Envía la matriz entera.
- Con el `200`, se queda en la página con lo que respondió el servidor y «Profesores de {curso} guardados» en un `role="status"`.
- Un `400` con `NOT_FOUND` vuelve a pedir la matriz y avisa «Algo cambió mientras editabas: revisa la matriz».
- Un `404` muestra la vista de no existe.
- Cualquier otro fallo, un `role="alert"`, conservando lo editado.

#### Scenario: Matriz vacía
- **GIVEN** 1º Primaria con las clases A y B y Lengua (5), Matemáticas (5) e Inglés (3)
- **WHEN** abro sus profesores
- **THEN** veo las tres asignaturas con sus sesiones y dos columnas, todo «Sin asignar»
- **AND** veo «Sin profesor: 6 de 6»
- **AND** «Guardar» está deshabilitado

#### Scenario: Asignar y ver los recuentos
- **WHEN** elijo a «García, Ana» en Lengua y Matemáticas de A y a «Ruiz, Eva» en Inglés de A y de B
- **THEN** veo «Sin profesor: 2 de 6» y «En este curso: García, Ana 10 sesiones · Ruiz, Eva 6 sesiones»
- **AND** al guardar veo «Profesores de 1º Primaria guardados»

#### Scenario: Asignar al tutor
- **GIVEN** la tutora de A es Ana García, y Lengua de A ya es de Luis Pérez
- **WHEN** pulso «Asignar al tutor» en A
- **THEN** Matemáticas e Inglés de A pasan a Ana García
- **AND** Lengua sigue con Luis Pérez

#### Scenario: Clase sin tutor
- **WHEN** la clase B no tiene tutor
- **THEN** su «Asignar al tutor» está deshabilitado y lo explica

#### Scenario: Algo cambió mientras se editaba
- **WHEN** el `PUT` responde `400` con `NOT_FOUND`
- **THEN** la página vuelve a pedir la matriz y avisa

#### Scenario: Curso sin asignaturas
- **WHEN** abro los profesores de un curso sin asignaturas
- **THEN** veo la explicación y el enlace a su carga horaria

### Requirement: Accesibilidad, responsive e i18n de las asignaciones
La página MUST cumplir lo siguiente:
- cada `select` tiene etiqueta;
- la tabla tiene cabeceras de fila y de columna;
- a 360 px se ve en tarjetas sin desplazamiento horizontal;
- no tiene violaciones de `axe`;
- los textos están en `es.json` y `en.json`, bajo `assignments.*`.

#### Scenario: Sin violaciones
- **WHEN** se analiza la página con `axe` a 1280 y a 360 px
- **THEN** no hay violaciones

### Requirement: Asignaciones de extremo a extremo
Un E2E (`cypress/e2e/assignments.cy.ts`) MUST cubrir estos casos:
- abrir los profesores de un curso desde «Cursos»;
- asignar, usar «Asignar al tutor», guardar y ver los recuentos;
- ver las asignaturas en el listado de profesores y buscarlas;
- quitar la clase o la asignatura del curso y ver que la asignación desaparece;
- un `MEMBER` que edita;
- 360 px sin desplazamiento horizontal.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/assignments.cy.ts`
- **THEN** todos los casos pasan
