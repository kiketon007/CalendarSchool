## ADDED Requirements

### Requirement: Contrato de la comprobación en OpenAPI
`docs/api-spec.yml` MUST documentar **`GET /api/schedule/readiness`** (`getScheduleReadiness`), con seguridad Bearer y sin parámetros: `200` (`no-store`), `401`, `500` y `503`. No hay `403` ni códigos de error nuevos.

La respuesta es `ScheduleReadinessResponse`, `{ success: true, data: { readiness: ScheduleReadiness } }`:
- **`ScheduleReadiness`:** `{ ready: boolean, blocking: ReadinessIssue[], warnings: ReadinessIssue[] }`.
- **`ReadinessIssue`:** `code` (`ReadinessIssueCode`, requerido) y, según el código: `course`, `subject`, `schoolClass` y `calendar` (`{ id, name }`), `professor` (`{ id, firstName, lastName }`), `classes` (`{ id, name }[]`), `courses` (`{ id, name }[]`) y los enteros `assigned`, `available`, `sessions`, `count` y `missingCount`.
- **`ReadinessIssueCode`:** los nueve bloqueantes y los siete avisos del requisito «Bloqueantes y avisos».

Los tipos del frontend MUST regenerarse.

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias
- **AND** `api/schema.test.ts` fija la operación, sus respuestas y los esquemas

### Requirement: Foto del problema
El backend MUST leer, en una sola operación del repositorio `SchedulingProblemRepository.read(schoolId)` y sin una consulta por curso, asignatura o profesor, la «foto del problema» del colegio (`SchedulingProblem`, `domain/schedule/`):
- **cursos:** id, nombre, su calendario (id, nombre y periodos con tipo, inicio y fin en minutos, en orden) o `null`, y sus clases (id y nombre);
- **asignaturas de cada curso:** id, nombre, estado (`ACTIVE` o `INACTIVE`), sesiones a la semana, máximo al día y tamaño de bloque (o `null`), sus celdas prohibidas y preferidas guardadas (`{ dayOfWeek, sessionNumber }`), y quién la da en cada clase (`{ classId, professorId }`);
- **profesores:** id, nombre, apellidos y sus tramos no disponibles en minutos.

La lectura MUST ser sin bloqueos y solo del colegio de la identidad. La foto MUST poder pasarse tal cual al motor de US-ALGO-RUN.

#### Scenario: Colegio completo
- **GIVEN** un colegio con dos cursos, un calendario, asignaturas con reglas y franjas, asignaciones y profesores con tramos
- **WHEN** se lee su foto
- **THEN** tiene todos esos datos y ninguno de otro colegio

#### Scenario: Colegio vacío
- **WHEN** se lee la foto de un colegio sin cursos ni profesores
- **THEN** tiene `courses: []` y `professors: []`

### Requirement: Bloqueantes y avisos
La función pura `readinessOf(problem, compareNames)` (`domain/schedule/readiness.ts`) MUST devolver `{ ready, blocking, warnings }`, con `ready` igual a `blocking.length === 0`. Solo las asignaturas **activas** cuentan: una inactiva no cuenta en la carga del curso, en las reglas, en las asignaciones ni en la carga de los profesores.

**Bloqueantes**, en este orden de códigos y, dentro de cada código, por curso, asignatura, clase y profesor (con `compareNames`):
1. `SCHOOL_WITHOUT_COURSES`: el colegio no tiene cursos.
2. `COURSE_WITHOUT_CALENDAR` (`course`): un curso con alguna asignatura activa y sin calendario.
3. `WORKLOAD_EXCEEDS_SLOTS` (`course`, `assigned`, `available`): la suma de las sesiones de sus asignaturas activas supera las de su calendario (`workloadWarnings`).
4. `BLOCK_LARGER_THAN_LOAD` (`course`, `subject`): pide bloques mayores que su carga.
5. `SUBJECT_DOES_NOT_FIT` (`course`, `subject`): no cabe en su curso con sus reglas y sus franjas prohibidas (`subjectWarnings`).
6. `SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR` (`course`, `subject`, `schoolClass`, `professor`): cabe con sus reglas, pero no en esa clase cuando a sus franjas prohibidas se añaden las celdas que se solapan con los tramos no disponibles de su profesor. Solo se comprueba para las asignaturas que no tienen los dos códigos anteriores y en las clases con profesor.
7. `CLASSES_WITHOUT_PROFESSOR` (`course`, `subject`, `classes`, `missingCount`): una asignatura activa sin profesor en alguna de las clases de su curso.
8. `EXCEEDS_MAX_HOURS` (`professor`): pasa de 23 h aunque le toquen las sesiones más cortas (`teachingLoadOf`).
9. `AVAILABILITY_INSUFFICIENT` (`professor`, `calendar`, `sessions`, `available`): en un calendario tiene más sesiones que sesiones en las que puede dar clase.

**Avisos**, en este orden:
1. `SUBJECT_INACTIVE` (`subject`, `courses`): una asignatura inactiva con carga en algún curso; no se generará.
2. `COURSE_WITHOUT_CLASSES` (`course`): un curso sin clases.
3. `COURSE_WITHOUT_SUBJECTS` (`course`): un curso con clases y calendario pero sin asignaturas activas.
4. `MAY_EXCEED_MAX_HOURS` (`professor`): puede pasar de 23 h según las sesiones que le toquen.
5. `SEVERAL_CALENDARS` (`professor`, `count`): da clase en varios calendarios.
6. `SLOTS_OUTSIDE_CALENDAR` (`course`, `subject`, `count`): tiene celdas guardadas, prohibidas o preferidas, que ya no existen en el calendario.
7. `PREFERRED_SLOTS_FORBIDDEN` (`course`, `subject`, `count`): tiene celdas preferidas que también están prohibidas.

Los tramos no disponibles se llevan a celdas de un calendario con una función pura: la celda `(día, n)` no está disponible si la sesión `n` del calendario se solapa con algún tramo de ese día (`[a, b)` y `[s, e)` se solapan si `a < e` y `s < b`). El backend MUST recorrer una tabla de casos `test-fixtures/schedule-readiness.json` con al menos un caso por código.

#### Scenario: Listo para generar
- **GIVEN** un colegio con un curso con calendario, sus asignaturas activas con profesor en todas las clases y sin problemas
- **THEN** `ready` es `true`, `blocking` es `[]` y `warnings` es `[]`

#### Scenario: Curso sin calendario y carga que no cabe
- **GIVEN** 6º Primaria con asignaturas y sin calendario, y 1º Primaria con 31 sesiones en un calendario de 30
- **THEN** `blocking` es `[COURSE_WITHOUT_CALENDAR 6º Primaria, WORKLOAD_EXCEEDS_SLOTS 1º Primaria (31, 30)]`
- **AND** `ready` es `false`

#### Scenario: Asignatura que no cabe con su profesor
- **GIVEN** Inglés en 1º A, 3 sesiones con máximo 1 al día y el viernes prohibido, dado por Eva, que no puede lunes ni martes
- **THEN** hay un `SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR` con 1º Primaria, Inglés, A y Eva
- **AND** si Eva pudiera los martes, no lo hay

#### Scenario: Clases sin profesor
- **GIVEN** Inglés en 1º Primaria, con las clases A, B y C, con profesor solo en A
- **THEN** hay un `CLASSES_WITHOUT_PROFESSOR` con `classes` B y C y `missingCount` 2

#### Scenario: Profesores
- **GIVEN** un profesor que pasa de 23 h, otro al que no le alcanza la disponibilidad y otro que puede pasar de 23 h y da clase en dos calendarios
- **THEN** los dos primeros son bloqueantes y el tercero tiene los avisos `MAY_EXCEED_MAX_HOURS` y `SEVERAL_CALENDARS`

#### Scenario: Asignatura inactiva
- **GIVEN** Francés inactiva con 2 sesiones en 5º Primaria, dada por Luis
- **THEN** hay un aviso `SUBJECT_INACTIVE` con Francés y 5º Primaria
- **AND** Francés no cuenta en la carga de 5º, ni en la de Luis, ni puede dar `CLASSES_WITHOUT_PROFESSOR`

#### Scenario: Casos vacíos
- **GIVEN** un colegio sin cursos
- **THEN** el único bloqueante es `SCHOOL_WITHOUT_COURSES`
- **GIVEN** un curso sin clases y otro sin asignaturas activas
- **THEN** son los avisos `COURSE_WITHOUT_CLASSES` y `COURSE_WITHOUT_SUBJECTS`

#### Scenario: Franjas
- **GIVEN** una asignatura con 2 celdas guardadas fuera del calendario y 1 preferida prohibida
- **THEN** hay los avisos `SLOTS_OUTSIDE_CALENDAR` (2) y `PREFERRED_SLOTS_FORBIDDEN` (1)

### Requirement: Leer la comprobación con GET /api/schedule/readiness
`GET /api/schedule/readiness` MUST responder `200` con la comprobación del colegio de la sesión, calculada en cada petición y sin guardar nada. Lo pueden leer `ADMIN` y `MEMBER`; el `schoolId` sale de la identidad. La ruta va en un router propio, `scheduleRouter`, montado en `/schedule`, sin `requireRole` y sin evento de log.

#### Scenario: Comprobación del colegio
- **WHEN** un `ADMIN` la pide
- **THEN** responde `200` con `no-store` y la comprobación de su colegio

#### Scenario: Un miembro también la ve
- **WHEN** un `MEMBER` la pide
- **THEN** responde `200` con el mismo contenido

#### Scenario: Otro colegio
- **GIVEN** otro colegio con problemas
- **THEN** no aparecen en la respuesta

#### Scenario: Sin sesión
- **WHEN** se pide sin token
- **THEN** responde `401 INVALID_SESSION`

#### Scenario: Base de datos caída
- **WHEN** la base de datos no responde
- **THEN** responde `503`

### Requirement: Página «Generar horarios»
`/horarios` (`pages/ScheduleReadinessPage.tsx`, título «Generar horarios») MUST colgar de `AuthenticatedLayout` sin `RequireRole`. `AppHeader` MUST enlazar «Horarios» para los dos roles.

Carga:
- Pide la comprobación una sola vez, aunque `StrictMode` ejecute el efecto dos veces.
- Mientras carga, muestra un `role="status"`.
- Si falla, muestra un `role="alert"` con «Reintentar», que la vuelve a pedir.

`services/scheduleReadinessService.ts` (`get`) devuelve `loaded`, `unauthenticated` o `unavailable`, valida la forma (los códigos y las referencias que usa cada uno, y que `ready` coincida con `blocking` vacío) y nunca lanza.

La página MUST mostrar:
- **Arriba, el veredicto:** «Se puede generar» o «No se puede generar todavía: {n} problemas» (con plural), con texto e icono decorativo, nunca solo color. Debajo, siempre: «Que no haya problemas no garantiza que exista un horario: la generación lo comprueba».
- **Los bloqueantes** (si hay) y después **los avisos** (si hay), cada grupo con su encabezado y su recuento, y cada problema con su texto y su enlace:
  - `SCHOOL_WITHOUT_COURSES` → «Crear curso» (`/cursos/nuevo`);
  - `COURSE_WITHOUT_CALENDAR` → `/calendarios`;
  - `WORKLOAD_EXCEEDS_SLOTS`, `BLOCK_LARGER_THAN_LOAD`, `SUBJECT_DOES_NOT_FIT` y `COURSE_WITHOUT_SUBJECTS` → la carga del curso (`/cursos/{id}/carga`);
  - `SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR` → la disponibilidad del profesor y la carga del curso;
  - `CLASSES_WITHOUT_PROFESSOR` → la matriz de profesores del curso (`/cursos/{id}/profesores`);
  - `EXCEEDS_MAX_HOURS`, `MAY_EXCEED_MAX_HOURS` y `SEVERAL_CALENDARS` → el resumen de carga (`/profesores/resumen`);
  - `AVAILABILITY_INSUFFICIENT` → la disponibilidad del profesor (`/profesores/{id}/disponibilidad`);
  - `SLOTS_OUTSIDE_CALENDAR` y `PREFERRED_SLOTS_FORBIDDEN` → la cuadrícula de franjas de la asignatura en el curso;
  - `SUBJECT_INACTIVE` → la edición de la asignatura (`/asignaturas/{id}/editar`);
  - `COURSE_WITHOUT_CLASSES` → la edición del curso (`/cursos/{id}/editar`).

#### Scenario: Se puede generar
- **GIVEN** una comprobación sin bloqueantes ni avisos
- **WHEN** abro «Horarios»
- **THEN** veo «Se puede generar» y la nota de que no garantiza un horario

#### Scenario: Bloqueantes y avisos
- **GIVEN** 2 bloqueantes y 1 aviso
- **THEN** veo «No se puede generar todavía: 2 problemas», los dos bloqueantes con sus enlaces y después el aviso con el suyo

#### Scenario: Texto de cada problema
- **GIVEN** un `SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR` de Inglés en 1º Primaria A con Eva García
- **THEN** veo «Inglés en 1º Primaria A no cabe con García, Eva: sus franjas prohibidas y las horas en que no puede no dejan sitio» con enlaces a su disponibilidad y a la carga de 1º Primaria

#### Scenario: Error al cargar
- **WHEN** la comprobación no se puede cargar
- **THEN** veo un aviso con «Reintentar», que la vuelve a pedir una sola vez

#### Scenario: Navegación
- **WHEN** un `MEMBER` abre la aplicación
- **THEN** la cabecera tiene «Horarios», que lleva a `/horarios`

### Requirement: Accesibilidad e i18n de la comprobación
La página MUST no tener violaciones de `axe` (lista, con problemas, cargando y con error), verse a 360 px sin desplazamiento horizontal, decir con texto si cada problema bloquea o avisa y tener sus textos en `es.json` y `en.json` (`schedule.readiness.*`), con plurales.

#### Scenario: Sin violaciones
- **WHEN** se pasa `axe` a la página con bloqueantes y avisos
- **THEN** no hay violaciones

### Requirement: Comprobación de extremo a extremo
Los E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, con datos creados por la API: un colegio con bloqueantes y avisos de varios tipos y sus enlaces; corregir uno (asignar el profesor que faltaba) y ver que desaparece al volver; un colegio listo para generar; la entrada «Horarios» de la cabecera; y a 360 px, sin desplazamiento horizontal.

#### Scenario: Recorrido de la comprobación
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/scheduleReadiness.cy.ts`
- **THEN** pasan todos sus tests
