## Context

US14 creó la tabla `students` (`course_id` y `class_id` nulos con `ON DELETE SET NULL`, índices por ambos) y el recuento de alumnos **del curso** en el impacto y el borrado (`PrismaCourseRepository.impactOf` y `delete`). Las respuestas de cursos (`Course` y `SchoolClass` del dominio, que `coursesRouter` serializa tal cual con `sendSuccess`) no llevan ningún número, `/cursos` no muestra alumnos (un test unitario y un E2E lo comprueban) y en la edición `CourseForm.removeRow` quita la fila al instante. Quitar una clase con alumnos ya es seguro en datos (quedan en el curso sin clase), pero no se avisa.

Restricciones: contrato primero (`docs/api-spec.yml` → tipos generados), arquitectura hexagonal, `CourseForm` compartido por la creación y la edición, patrón de diálogos de react-bootstrap ya usado (`ConfirmSuspendModal`, `DeleteCourseModal`) y decisiones validadas en la ficha (2026-10-22).

## Goals / Non-Goals

**Goals:**
- `studentCount` en `Course` y `SchoolClass` en todas las respuestas de cursos, con un número fijo de consultas en el listado.
- Columna «Alumnos» y números por clase en `/cursos`; número por clase y confirmación al quitar una clase con alumnos en la edición.

**Non-Goals:**
- Contar en el `PUT` los alumnos que quedan sin clase o bloquear el guardado si el número cambió.
- Un campo `unassignedStudentCount` en el contrato.
- Listar o mover alumnos desde el curso; cambios en el borrado de cursos, en los eventos o en el modelo de datos.

## Decisions

### 1. Los números son parte del curso del dominio

`domain/course/course.ts`: `SchoolClass` gana `readonly studentCount: number` y `Course` también. Así `ListCourses`, `GetCourse`, `CreateCourse` y `UpdateCourse` no cambian de forma y el router los serializa sin mapeo. `PrismaCourseRepository.create` devuelve `0` en todo (un curso recién creado no puede tener alumnos: ninguna transacción de alta de alumnos puede verlo antes del `COMMIT`).

*Alternativa descartada:* un tipo `CourseWithCounts` solo para las lecturas. Obligaría a dos formas de `Course` en el contrato y en el frontend para un dato que siempre es barato.

### 2. `_count` de Prisma en `LIST_FIELDS`

`LIST_FIELDS` añade `_count: { select: { students: true } }` al curso y a cada clase; `EDIT_FIELDS` lo hereda y la lectura final del `update` (dentro de la transacción, después de escribir) usa `LIST_FIELDS`, así que el `200` del `PUT` lleva los números del estado final. `toCourse` traduce `_count.students` a `studentCount`. Prisma resuelve `_count` de una relación con una subconsulta agregada por nivel, no por fila: el número de consultas no depende del número de cursos.

Los alumnos sin clase **no** se cuentan aparte: son `course.studentCount − Σ class.studentCount`. Salen de la misma lectura, así que la resta es coherente.

*Alternativas descartadas:* un `groupBy` separado por `course_id` y `class_id` (dos consultas y un cruce a mano); un `student.count` por curso (N+1); `unassignedStudentCount` en el contrato (redundante y otra consulta).

**Test de consultas:** el test de integración crea un `PrismaClient` propio con `log: [{ emit: 'event', level: 'query' }]` sobre la base de test (mismo adaptador que `createPrismaClient`), cuenta los eventos `query` de `listBySchool` con 1 curso y con 10 cursos, y exige que sean iguales.

### 3. El `PUT` ignora los números recibidos

`parseUpdateCourseRequest` ya descarta propiedades desconocidas: un `studentCount` en el curso o en una clase no llega al dominio. Se añade un test que lo fija. El contrato no los declara en `UpdateCourseRequest`.

### 4. Frontend: validación y presentación

- **`coursesService`:** la guarda de forma de `Course`/`SchoolClass` exige `studentCount` entero ≥ 0 en las dos (cualquier otra cosa es `unavailable`, como `createdAt` o `tutor`), en `list`, `get`, `create` y `update`. Los fixtures de cursos de los tests (y `testSupport` si los centraliza) ganan los números.
- **`CoursesPage`:** las filas preparadas en el `useMemo` añaden `classesText` con «A (12), B (10)» (clave i18n con el número por clase) y `studentsText` («25» o «25 (3 sin clase)», con `courses.list.studentsWithUnassigned`). La columna «Alumnos» va entre «Tutores» y «Creado»; en las tarjetas, un `dt`/`dd` más. La búsqueda sigue mirando solo el nombre.
- **`CourseForm`:** nueva prop opcional `classStudentCounts?: Record<string, number>` (por `id` de clase, como `classTutors`). Si una fila con `id` tiene número > 0, se pinta «{N} alumnos» (plural `courses.form.classStudents_one/_other`) bajo el campo, con id propio en el `aria-describedby` del campo junto al del tutor. No entra en `CourseDraft` ni en `hasCourseChanges`. `CreateCoursePage` no la pasa; `EditCoursePage` la construye desde el curso cargado.

### 5. Confirmación: `ConfirmRemoveClassModal` controlado por `CourseForm`

`removeRow(index)` pasa a `requestRemoveRow(index)`: si la fila tiene `id` y `classStudentCounts[id] > 0`, guarda en estado `{ key, name, count }` de la fila pendiente y abre el diálogo; si no, llama a `removeRow` como hoy. El diálogo se identifica por la `key` de la fila (estable aunque cambie la posición); al confirmar se busca su índice actual y se quita.

`components/ConfirmRemoveClassModal.tsx` sigue a `ConfirmSuspendModal`: siempre montado, `show` gobernado por la fila pendiente (`null` = cerrado), conserva el último contenido durante la animación de cierre, título como nombre accesible (`aria-labelledby`), sin «X» de cabecera, foco inicial en «Cancelar» (`autoFocus`), «Quitar clase» en `danger`. Props: `pending`, `onConfirm`, `onCancel`, `onExited`. No hace peticiones.

**Foco:** al cancelar, react-bootstrap devuelve el foco al elemento que lo tenía al abrirse (el «Quitar» de la fila). Al confirmar, ese botón desaparece: `CourseForm` guarda en una `ref` que debe enfocar «Añadir clase» y lo hace en `onExited` con un `setTimeout` de 0 ms, la misma técnica de US08 (react-bootstrap suelta la captura de foco justo después de `onExited`). «Añadir clase» siempre está habilitado tras quitar una fila (quedan menos de 12).

El nombre del diálogo es el valor escrito en la fila (recortado); si está vacío, el texto de posición («la clase 2», misma clave que la etiqueta de la fila).

*Alternativas descartadas:* `window.confirm` (sin estilos ni i18n de botones, y no accesible de forma consistente); confirmar al pulsar «Guardar» con un resumen (la ficha pide avisar en el momento de quitar, cuando la persona aún ve la fila); hacer el diálogo responsable de quitar la fila (mezcla el estado del formulario con el del diálogo).

### 6. Tests que cambian a propósito

`CoursesPage.test.tsx` («no muestra alumnos ni horario») pasa a comprobar solo que no hay horario; `courses.cy.ts` acota `/horario/i` en `main`. Se menciona en la PR.

## Risks / Trade-offs

- [Número desactualizado en el diálogo si otra persona asigna alumnos mientras se edita] → decisión validada: los alumnos no se pierden, quedan «sin clase» y se ven en `/cursos` y `/alumnos`; si molesta, una historia posterior puede contar en el `PUT` (como el borrado).
- [`_count` cambia el SQL de las lecturas de cursos] → los índices `students_course_id_idx` y `students_class_id_idx` existen; el test de número de consultas evita un N+1.
- [Los fixtures de `Course` en muchos tests del frontend y del backend fallan al hacer obligatorio `studentCount`] → es esperado: se actualizan en el grupo de revisión de tests, centralizando los números en los helpers de fixtures cuando existan.
- [Foco tras confirmar en jsdom] → jsdom no reproduce la captura de foco de react-bootstrap; el E2E comprueba `have.focus` en «Añadir clase».
- **Seguridad:** sin cambios de acceso; los recuentos se filtran por el colegio (las relaciones cuelgan de cursos ya filtrados por `schoolId`, y los alumnos de un curso siempre son de su colegio por la transacción del alta). Los números no entran en los logs.
- **Rendimiento:** dos subconsultas agregadas por índice en cada lectura de cursos; sin paginación, como hoy.

## Migration Plan

Sin migración. El despliegue publica a la vez la Lambda (que empieza a devolver los números) y el frontend (que los exige). Durante la ventana entre la publicación de la Lambda y la invalidación de `index.html`, un frontend viejo ignora los campos nuevos; un frontend nuevo contra una Lambda vieja vería `unavailable` en cursos, pero el pipeline despliega primero el backend. Vuelta atrás: revertir la PR.

## Open Questions

Ninguna: las decisiones de producto están validadas en la ficha.
