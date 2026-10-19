## Context

Hasta ahora el backend solo gestiona el colegio, sus usuarios, las sesiones y los enlaces de acceso (`schools`, `users`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `municipalities`). US05 abre el módulo funcional con los cursos y sus clases. Las piezas que reutiliza ya existen: `requireAuthentication` con la identidad leída de la base de datos (`schoolId`, `role`), el formato común de respuesta y `errorHandler`, `IdGenerator` (UUIDv7), `violatedUniqueIndex` para traducir violaciones de unicidad por el nombre del índice, `translateDatabaseErrors`, la tabla compartida de validación (`test-fixtures/registration-fields.json`), `authorizedFetch` y el patrón de servicios con un resultado por caso.

Restricciones: el tutor es opcional y no hay tabla `professors` (llega con US09); el nombre del curso es único por colegio; máximo 12 clases por curso; cualquier rol puede crear y listar; el PRD §3.4 y las fichas ya reflejan estas decisiones.

## Goals / Non-Goals

**Goals:**
- Crear un curso con sus clases de forma atómica y sin duplicados, también con envíos simultáneos.
- Listar los cursos del colegio con sus clases, ordenados de forma natural para un usuario («2º» antes que «10º»).
- Dejar el contrato preparado para el tutor (`tutor: null`) sin crear todavía nada de profesores.
- Mismas reglas de validación en el backend y en el frontend.

**Non-Goals:**
- Tutores, profesores y la regla «un profesor tutoriza una sola clase» (US09, US07); cascada al borrar un profesor (US13).
- Búsqueda, paginación, edición, borrado y el resto de US06, US07 y US08.
- `academic_year`, `code`, `level`, `status` y columnas de auditoría.
- Activar la tarjeta «Gestión de horarios» de la bienvenida.

## Decisions

### D1. Dos tablas con el nombre normalizado guardado y un índice único

`courses (id, school_id, name, normalized_name, created_at, updated_at)` con `UNIQUE (school_id, normalized_name)` (`courses_school_id_normalized_name_key`), y `classes (id, course_id, name, normalized_name, created_at, updated_at)` con `UNIQUE (course_id, normalized_name)` (que además sirve de índice por `course_id`, su primera columna, así que no hace falta otro) y `ON DELETE CASCADE` hacia `courses`. En Prisma, el modelo de la clase se llama `SchoolClass` (`@@map("classes")`) para no chocar con la palabra reservada `class`. `normalized_name` = recortar, colapsar espacios y pasar a minúsculas (`toLocaleLowerCase('es')`), calculado por una función pura del dominio (`domain/course/courseNames.ts`), la misma que decide qué se guarda en `name` (recortado y colapsado).

*Alternativas descartadas:* un índice funcional `lower(name)` o `citext` (Prisma no los modela y habría que mantenerlos a mano en el SQL de cada migración; `schools` ya usa la columna normalizada); quitar los acentos al normalizar (convertiría «Año» y «Ano» en el mismo curso, y `º`/`ª` no se descomponen de forma fiable).

### D2. Alta atómica con una escritura anidada y traducción del índice

`PrismaCourseRepository.create(schoolId, course)` hace un único `course.create` con `classes: { create: [...] }`, que Prisma ejecuta en una transacción. Una violación de `courses_school_id_normalized_name_key` se traduce, con `violatedUniqueIndex`, a `CourseAlreadyExists` (dominio), que `errorHandler` convierte en `409 COURSE_ALREADY_EXISTS`. Los fallos de conexión pasan por `translateDatabaseErrors` (`503`). La unicidad de las clases la decide la validación de la aplicación (D4); el índice de `classes` es la red de seguridad: si saltara, es un error de programación (`500`), no un caso de usuario.

*Alternativas descartadas:* comprobar antes con una consulta y después insertar (carrera entre dos peticiones simultáneas; la base de datos es la única que puede garantizarlo); bloquear la fila del colegio con `FOR UPDATE` como en la gestión de usuarios (innecesario: aquí basta con el índice, no hay un invariante que dependa de varias filas).

### D3. Capas y puertos

- **Dominio** (`domain/course/`): tipos `Course` y `SchoolClass` (con `tutor: null`), el puerto `CourseRepository` (`create`, `listBySchool`), el error `CourseAlreadyExists` y las funciones de nombres. Sin dependencias.
- **Aplicación** (`application/courses/`): `CreateCourse` (valida con Zod, genera los ids con `IdGenerator`, llama al repositorio y registra los eventos) y `ListCourses` (lee y ordena). `createCourseRequest.ts` define el esquema y traduce los problemas a `ValidationError`.
- **Infraestructura** (`infrastructure/prisma/prismaCourseRepository.ts`): el adaptador, con `select` explícito.
- **Presentación** (`presentation/courses/coursesRouter.ts`): `POST /` y `GET /` detrás de `requireAuthentication`, sin `requireRole` ni `requireAllowedOrigin` (Bearer, sin cookies). Se monta en `app.ts` bajo `/api/courses` y se cablea en `composeApp.ts`.

El `schoolId` y el `actorId` salen de `getAuthenticatedUser(res)`; el cuerpo nunca los aporta.

### D4. Validación compartida y formato de los errores

`test-fixtures/course-fields.json` lista ejemplos válidos e inválidos (con su código) del nombre del curso, del nombre de clase y del número de clases; `createCourseRequest.test.ts` y `courseValidation.test.ts` lo recorren. Las reglas usan clases Unicode (`\p{L}`, `\p{N}`) más `º`, `ª`, `-`, `/` y espacio, con la bandera `u`. El esquema recorre todos los campos sin parar en el primero y la unicidad de las clases se comprueba con los nombres normalizados (`DUPLICATE` en la segunda y siguientes apariciones). El campo de una clase se nombra `classes[<i>].name` (índice desde 0), que el frontend asocia a su fila. `FieldErrorCode` (contrato y tipo del backend) gana `DUPLICATE`; las propiedades desconocidas se ignoran, como en el login.

*Alternativa descartada:* usar la ruta de Zod (`classes.1.name`): el formato con corchetes es el que el frontend ya muestra a desarrolladores en otros sitios y no depende de la librería.

### D5. Orden en la aplicación

`ListCourses` ordena cursos y clases con `localeCompare(…, 'es', { numeric: true, sensitivity: 'base' })`, igual que la lista de usuarios y la de municipios ordenan en la aplicación: la colación de PostgreSQL en Supabase no es la del castellano y no ordena los números de forma natural. La consulta trae los cursos del colegio con sus clases incluidas (una consulta, índices por `school_id` y `course_id`).

### D6. Frontend

- `services/coursesService.ts`: `list(authorizedFetch)` → `loaded | unauthenticated | unavailable`; `create(authorizedFetch, input)` → `created | validationError (details) | alreadyExists | unauthenticated | unavailable`. Interpreta por `error.code` y nunca lanza.
- `pages/CoursesPage.tsx` (`/cursos`): carga única con `ref` (como `UsersPage`), estados de carga y error con «Reintentar», listado con un `h2` por curso y una lista de sus clases («A — Sin tutor»), vacío con «Crear curso», y el aviso de llegada leído de `useLocation().state` con una guarda de tipo (`courseCreatedFrom`) que solo acepta `{ courseCreated: string }`.
- `pages/CreateCoursePage.tsx` (`/cursos/nuevo`): las filas de clases tienen un id local estable (un contador en una `ref`) para las `key` y los `id` de los campos; «Añadir clase» hasta 12 y «Quitar la clase N» en todas salvo cuando hay una sola. Guarda síncrona `isSubmittingRef`. Errores por campo con `aria-invalid`/`aria-describedby`; un `role="alert"` para los errores generales. Con `created`, `navigate('/cursos', { replace: true, state: { courseCreated: name } })`.
- `components/AppHeader.tsx`: la `nav` se pinta para todos los roles; «Cursos» (`NavLink` a `/cursos`, que marca `aria-current` también en `/cursos/nuevo`) para todos y «Usuarios» solo para `ADMIN`. La bienvenida no cambia.
- `App.tsx`: `/cursos` y `/cursos/nuevo` como hijas de `AuthenticatedLayout`, sin `RequireRole`.

### D7. Observabilidad

`CreateCourse` registra `COURSE_CREATED` (`school_id`, `actor_id`, `course_id`, `class_count`) y `COURSE_CREATION_REJECTED` (`school_id`, `actor_id`, `reason: "duplicate"`). Los nombres no van al log: identifican el centro y no aportan para depurar.

### D8. Seguridad y rendimiento

Aislamiento por colegio en todos los métodos del puerto (`schoolId` obligatorio); Prisma parametrizado; el tamaño del cuerpo lo limita `express.json()` y el número de clases, la validación (12). No aplica el límite de tiempo del CSP (no hay generación de horarios). El listado no pagina: un colegio tiene decenas de cursos como mucho; US06 añadirá la paginación si hace falta.

## Risks / Trade-offs

- [La navegación de la cabecera pasa a mostrarse a los `MEMBER`] → revisar `AppHeader.test.tsx` y los E2E que comprueban que un miembro no ve enlaces (`invitation-acceptance.cy.ts`, `users.cy.ts`); ahora deben comprobar que no ve «Usuarios».
- [`cy.contains('a', 'Usuarios')` o selectores parecidos encuentran otro enlace] → los E2E nuevos buscan los enlaces dentro de la `nav` con nombre.
- [Normalización distinta en frontend y backend] → la tabla compartida tiene ejemplos de mayúsculas, espacios y caracteres especiales; los dos lados la recorren.
- [US09 cambia `SchoolClass.tutor`] → el contrato ya lo declara (`null`), así que US09 solo cambia su valor.
- [Migración en producción] → es aditiva (dos tablas nuevas, sin tocar las existentes) y `deploy.yml` la aplica antes de publicar.

## Migration Plan

Migración de Prisma nueva (`add_courses_and_classes`), aditiva. En el despliegue, `prisma migrate deploy` la aplica antes de publicar la Lambda y el frontend. Vuelta atrás: desplegar el commit anterior (las tablas nuevas quedan vacías o sin usar y no afectan a nada); si hubiera que retirarlas, una migración posterior las elimina. No hay datos que migrar.

## Open Questions

Ninguna: las decisiones de producto (tutor opcional, alcance, máximo de 12 clases y bienvenida sin cambios) están cerradas en la ficha de US05.
