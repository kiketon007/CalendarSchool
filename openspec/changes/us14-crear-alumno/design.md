## Context

- **Backend:** los cursos (`courses`) y sus clases (`classes`, `ON DELETE CASCADE` desde el curso) existen desde US05; el borrado de un curso (US08) bloquea la fila con `SELECT … FOR UPDATE`, cuenta y borra, y su contrato ya lleva `studentCount`, fijado a `0` por la constante `STUDENT_COUNT_UNTIL_US14` de `PrismaCourseRepository`. La edición de un curso (US07) también bloquea la fila del curso. Los profesores (US09) son el patrón de un alta con listado mínimo: `createProfessorRequest.ts` (reglas de la persona de `USER_FIELD_SCHEMAS`, tabla `test-fixtures/professor-fields.json` compartida con el frontend), `CreateProfessor`, `ListProfessors` (orden con `compareText` de `courseOrdering.ts`) y `professorsRouter` con `requireAuthentication` y sin `requireRole`.
- **Frontend:** `ProfessorsPage` y `CreateProfessorPage` (US09) con `ProfessorForm` (US12) son el patrón de listado mínimo, alta, aviso de llegada con guarda de tipo, desplegable de clases agrupadas y foco en el primer error. `AppHeader` lleva la navegación. `DeleteCourseModal` ya pinta «Tiene M alumnos asignados» cuando `studentCount > 0` y el aviso «… M alumnos quedan sin clase».
- **Datos de test:** `resetDatabase()` y `cleanE2eData` vacían todas las tablas salvo `PRESERVED_TABLES`, así que una tabla nueva queda cubierta sin tocarlos.
- Decisiones de producto (ficha de US14, validadas el 2026-10-21): dividir en US14 y US14_b; sin `status`; tipo de comida y observaciones como datos sensibles; beca de comedor; borrar un curso deja a sus alumnos sin curso ni clase.

## Goals / Non-Goals

**Goals:**

- Registrar alumnos con su curso, su clase opcional y sus datos de comedor, con la misma validación en cliente y servidor.
- Garantizar que la clase de un alumno es de su curso y que ambos son de su colegio, también con borrados y ediciones simultáneos.
- Que borrar un curso o quitar una clase nunca borre alumnos, y que el diálogo de US08 cuente los de verdad.
- No exponer los datos sensibles fuera de la ficha del alumno (hoy, solo la respuesta del alta).

**Non-Goals:**

- Filtros, búsqueda y paginación (US15, US16), edición (US17), borrado (US18), número de alumnos en `/cursos` y confirmación al quitar una clase (US14_b), ID interno, email, estados, importación, cifrado de campos.

## Decisions

### 1. Modelo: `students` con curso y clase nulos y `ON DELETE SET NULL`

```prisma
model Student {
  id           String       @id @db.Uuid
  schoolId     String       @map("school_id") @db.Uuid
  courseId     String?      @map("course_id") @db.Uuid
  classId      String?      @map("class_id") @db.Uuid
  firstName    String       @map("first_name") @db.VarChar(100)
  lastName     String       @map("last_name") @db.VarChar(100)
  cafeteria    Boolean
  scholarship  Boolean?
  foodType     String?      @map("food_type") @db.VarChar(255)
  observations String?      @db.Text
  createdAt    DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)
  school       School       @relation(fields: [schoolId], references: [id])
  course       Course?      @relation(fields: [courseId], references: [id], onDelete: SetNull)
  schoolClass  SchoolClass? @relation(fields: [classId], references: [id], onDelete: SetNull)
  @@index([schoolId]) @@index([courseId]) @@index([classId])
  @@map("students")
}
```

(Los tipos de fecha y la generación del `id` siguen a `Professor`.) La migración `add_students` añade a mano `CHECK (cafeteria OR (scholarship IS NULL AND food_type IS NULL))` y `CHECK (cafeteria = (scholarship IS NOT NULL))`, para que la base de datos no admita beca sin comedor ni comedor sin respuesta de beca. Borrar un curso pone `course_id` y, en cascada de las clases, `class_id` a `NULL`; quitar una clase pone solo `class_id` a `NULL`. Un alumno sin curso con clase no puede darse: las clases solo desaparecen por su curso o por la edición del curso, y en los dos casos `class_id` pasa a `NULL`.

*Alternativa descartada:* `course_id NOT NULL` con `ON DELETE CASCADE` o `RESTRICT`. La persona usuaria eligió que el alumno sobreviva al curso.

*Alternativa descartada:* una clave ajena compuesta `(class_id, course_id) → classes(id, course_id)` para garantizar la coherencia en la base de datos. Su `ON DELETE SET NULL` pondría también `course_id` a `NULL` al quitar una clase (PostgreSQL 15+ admite `SET NULL (class_id)`, pero Prisma no lo expresa y su `migrate diff` lo daría por deriva). La coherencia la garantiza la transacción del alta (decisión 3) y, desde US17, la de la edición.

*Alternativa descartada:* `status` y `deleted_at` (modelo v2.1). Ninguna historia los usa todavía.

### 2. Contrato

- `POST /api/students` (`createStudent`): `CreateStudentRequest` `{ firstName, lastName, courseId, classId?, cafeteria, scholarship?, foodType?, observations? }`; `201` con `{ student: Student }`; `400`, `401`, `500`, `503`. `Student` = `{ id, firstName, lastName, course: { id, name } | null, class: { id, name } | null, cafeteria, scholarship: boolean | null, foodType: string | null, observations: string | null }`.
- `GET /api/students` (`listStudents`): `200` con `{ students: StudentSummary[] }` (lo mismo **sin** `foodType` ni `observations`), `Cache-Control: no-store`; `401`, `500`, `503`.
- `FieldErrorCode` gana **`NOT_ALLOWED`**: un campo que no se admite por el valor de otro (beca o tipo de comida con `cafeteria: false`). Es genérico y lo podrán reutilizar otras historias.
- `CourseImpact.studentCount` y `DeleteCourseResponse`: solo cambia la descripción («alumnos del curso, con y sin clase; quedan sin curso ni clase»).

*Alternativa descartada:* ignorar en silencio la beca y el tipo de comida cuando `cafeteria` es `false`. Ocultaría un error del cliente y el `CHECK` haría de red de seguridad con un `500`.

*Alternativa descartada:* devolver `foodType` y `observations` en el listado para que US15 pueda filtrar. Son datos sensibles; US15 filtra por comedor y beca, no por ellos.

### 3. Alta: bloqueo compartido del curso y comprobación en la transacción

`parseCreateStudentRequest` (en `application/students/createStudentRequest.ts`) valida con `USER_FIELD_SCHEMAS` (nombre y apellidos, tras `cleanName`), `courseId` (obligatorio, UUID), `classId` (opcional, UUID), `cafeteria` (booleano obligatorio), `scholarship` (booleano obligatorio con comedor; `NOT_ALLOWED` sin él), `foodType` (0–255 tras recortar, vacío = `null`; `NOT_ALLOWED` sin comedor) y `observations` (0–5000 tras recortar los extremos, conservando los saltos de línea interiores; vacío = `null`), y devuelve los errores en el orden de los campos. La longitud se mide en caracteres (puntos de código), como en el frontend.

`PrismaStudentRepository.create` abre un `$transaction`:

1. `SELECT id FROM courses WHERE id = $courseId AND school_id = $schoolId FOR SHARE` (`$queryRaw`): sin fila → `CourseNotFound`. El bloqueo compartido hace esperar al borrado y a la edición del curso (los dos toman `FOR UPDATE`), así que la clase no puede desaparecer entre la comprobación y el `INSERT`; dos altas en el mismo curso no se bloquean entre sí.
2. Con `classId`: `schoolClass.findFirst({ where: { id: classId, courseId } })`: sin fila → `ClassNotFound` (una clase de otro curso o de otro colegio es indistinguible de una inexistente).
3. `student.create` con un UUIDv7 y la lectura de vuelta (`select` con `course` y `schoolClass`), que es lo que se responde.

`CreateStudent` traduce `CourseNotFound` y `ClassNotFound` en `400 VALIDATION_ERROR` con `courseId: NOT_FOUND` o `classId: NOT_FOUND` y registra `STUDENT_CREATION_REJECTED` (`reason: course_not_found | class_not_found`); con éxito registra `STUDENT_CREATED` (`school_id`, `actor_id`, `student_id`, `has_class`, `cafeteria`). Ningún evento lleva nombres, tipo de comida ni observaciones. Los errores de dominio son propios del módulo (`domain/student/studentErrors.ts`) para no acoplarlo al de profesores.

*Alternativa descartada:* comprobar sin bloqueo y traducir la clave ajena violada (`P2003`) a `NOT_FOUND`. Funciona para el curso, pero una clase quitada entre la comprobación y el `INSERT` no viola nada (`SET NULL` solo actúa al borrar) y el alumno quedaría con la clase de otro estado del curso; el bloqueo compartido lo cierra sin depender de la carrera.

### 4. Listado

`ListStudents` lee los alumnos del colegio (`select` sin `foodType` ni `observations`, con `course.name` y `schoolClass.name`) y ordena en la aplicación por apellidos y nombre con `compareText`, como `ListProfessors`. Sin paginar (US15).

### 5. Recuento real en el borrado de cursos

`impactOf` cuenta `student.count({ where: { courseId } })` además de las clases; `delete` lo cuenta dentro de la transacción, después del `FOR UPDATE` y antes de borrar. Desaparece `STUDENT_COUNT_UNTIL_US14`. Se cuentan los alumnos **del curso** (con y sin clase), porque todos se quedan sin curso. El texto `courses.delete.deletedWithStudents_*` pasa a «… {{count}} alumnos quedan sin curso»; «Tiene {{count}} alumnos asignados» no cambia.

### 6. Frontend

- `services/studentsService.ts`: `list` (`loaded`, `unauthenticated`, `unavailable`) y `create` (`created`, `validationError` con los campos, `unauthenticated`, `unavailable`); valida la forma de las respuestas y nunca lanza. No envía `classId`, `foodType` ni `observations` vacíos, ni `scholarship`/`foodType` sin comedor.
- `validation/studentValidation.ts`: reutiliza `validateField` del registro para los nombres y añade el resto; su test recorre `test-fixtures/student-fields.json`; `studentErrorsFromServer` traduce los ocho campos.
- `components/StudentForm.tsx` (para reutilizarlo en US17): recibe `initialValues`, `courses` (cargando, cargados o error), `failureMessage` y `onSubmit` (`done`, `validationError`, `failed`). Curso con los cursos en el orden del servidor; clase con «Sin clase» y las clases del curso, desactivada sin curso y reiniciada al cambiarlo; comedor con dos `radio` sin valor inicial dentro de un `fieldset` con `legend`; beca (casilla) y tipo de comida solo con «Sí», descartados al pasar a «No»; observaciones con contador ligado por `aria-describedby`; la ayuda de los datos sensibles ligada a los dos campos. Validación al salir del campo y al enviar, foco en el primer inválido, guarda síncrona contra el doble envío. Si los cursos no cargan, curso y clase se desactivan con «Reintentar» y no se puede enviar (el curso es obligatorio). Sin cursos en el colegio, un texto con enlace a «Crear curso».
- `pages/CreateStudentPage.tsx` (`/alumnos/nuevo`): pide los cursos una vez (`StrictMode`); con el `201` navega a `/alumnos` con `replace` y `{ studentCreated: «Nombre Apellidos» }`; `courseId`/`classId` `NOT_FOUND` vuelven a pedir los cursos, marcan su campo y le dan el foco.
- `pages/StudentsPage.tsx` (`/alumnos`): como `ProfessorsPage` de US09 (tabla desde 768 px con `useMediaQuery`, tarjetas por debajo, carga única, «Reintentar», vacío, «Crear alumno», aviso con guarda de tipo como texto plano).
- `App.tsx` y `AppHeader`: rutas bajo `AuthenticatedLayout` sin `RequireRole`; «Alumnos» entre «Profesores» y «Usuarios».

### 7. Tabla de campos compartida

`test-fixtures/student-fields.json` con válidos e inválidos de `firstName`, `lastName`, `courseId`, `classId`, `cafeteria`, `scholarship` (con `cafeteria` de contexto), `foodType` y `observations` (incluidos 255/256 y 5000/5001 caracteres y saltos de línea). La recorren los tests del parser y de `studentValidation`.

## Risks / Trade-offs

- **Seguridad y aislamiento:** el colegio sale de la identidad; curso y clase se buscan dentro del colegio; el listado filtra por `school_id`. Los textos se guardan tal cual y React los pinta como texto plano.
- **Datos sensibles:** quedan en la base de datos en claro, como el resto; fuera de logs (los eventos solo llevan ids y booleanos) y del listado. Un tratamiento más estricto (cifrado, acceso por rol) queda para cuando el PRD lo pida.
- **Concurrencia:** el `FOR SHARE` del curso serializa el alta con el borrado y la edición del mismo curso; un alta que llega después de un borrado responde `400` con `courseId: NOT_FOUND`, y la que llega después de quitar la clase, `classId: NOT_FOUND`.
- **Rendimiento:** listado sin paginar (aceptado hasta US15, como profesores en US09); índices por `school_id`, `course_id` y `class_id`; el recuento del borrado es un `count` indexado. No afecta a la generación de horarios.
- **Alumnos sin curso:** tras borrar un curso aparecen como «Sin curso» hasta US17; el diálogo de US08 avisa antes.
- **Migración en producción:** es aditiva (tabla nueva); el despliegue la aplica antes de publicar el backend, como la de profesores.
