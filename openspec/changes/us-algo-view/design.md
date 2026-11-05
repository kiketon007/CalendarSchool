## Context

US-ALGO-RUN guarda el borrador del colegio en `schedules` (como mucho un `DRAFT` por colegio, índice único parcial `schedules_draft_key`) y `schedule_entries`: una fila por sesión con `course_id`, `class_id`, `subject_id`, `professor_id` (`ON DELETE SET NULL`), `day_of_week`, `session_number` y las horas en minutos (`start_minute`, `end_minute`), con índices en `schedule_id`, `class_id`, `subject_id` y `professor_id`. Las clases y las asignaturas caen en cascada. El panel de `/horarios` solo muestra «N sesiones colocadas». Un colegio real tiene unas 360 entradas (12 clases × 30) y uno grande, unas 1000.

En el frontend ya existen `SlotGrid` (la cuadrícula **interactiva** de franjas: botones con `aria-pressed`, cabeceras que marcan filas y columnas), las utilidades de calendario (`calendarPeriods.ts`, `sessionGroups.ts`), `useMediaQuery`, el patrón de filtros en la URL de `/alumnos` (`studentFilters.ts`) y los colores de asignatura con contraste AA (`SUBJECT_COLOR_STYLES`, `SubjectColorSwatch`).

## Goals / Non-Goals

**Goals:**
- Ver el borrador por clase, por profesor y de todo el colegio, con una sola petición.
- Una tabla de solo lectura reutilizable por las tres vistas y por US-ALGO-VIEW_b.
- No perder sesiones en silencio cuando los datos cambiaron después de generar.

**Non-Goals:**
- Exportar (US-ALGO-VIEW_b), el aviso general de borrador desfasado, editar, confirmar o descartar (US-ALGO-CONFIRM), borradores anteriores y la puntuación de las preferencias (US-ALGO-RUN_b).

## Decisions

### D1. Una sola lectura normalizada para las tres vistas
`GET /api/schedule/draft` devuelve la cabecera, los cursos (con su calendario actual y sus clases), las asignaturas, los profesores y las entradas solo con ids. El navegador construye las tres vistas con funciones puras (`utils/scheduleDraftViews.ts`) y `useMemo`, así que cambiar de vista o de selección no hace peticiones. Una respuesta de 1000 entradas son decenas de KB.

Alternativa descartada: un endpoint por vista (`/classes/{id}`, `/professors/{id}`, `/day/{n}`): más rutas, más casos de aislamiento y una petición en cada cambio de selección, para un volumen que cabe entero en una respuesta. Alternativa descartada: entradas desnormalizadas (con los nombres en cada una): repite el mismo texto cientos de veces.

### D2. La ruta es «el borrador», sin id
Solo hay un borrador por colegio, así que la ruta no lleva id: `GET /api/schedule/draft`, y `null` si no hay. Evita el `404` de un id antiguo (el `scheduleId` de una generación anterior desaparece al regenerar) y no hace falta que la página conozca la generación. Cuando US-ALGO-CONFIRM traiga el horario oficial, tendrá su propia ruta (`/api/schedule/official` o un parámetro de estado).

Alternativa descartada: `GET /api/schedules/{id}`: obliga a llevar el id en la URL de la página y a tratar ids viejos.

### D3. Las filas son los periodos del calendario actual del curso
Las entradas guardan la sesión y sus horas, pero no los recreos ni las franjas vacías, así que la tabla se dibuja con el calendario **actual** del curso y cada entrada se coloca por día y número de sesión. Los dos desfases que harían perder sesiones se tratan sin más lógica:
- **El curso ya no tiene calendario:** sus sesiones se listan por día con las horas guardadas en la entrada.
- **La sesión ya no existe en el calendario** (perdió sesiones): la entrada se lista debajo de la tabla como «Sesiones fuera del calendario actual».

Si el calendario solo cambió de horas, la tabla muestra las horas actuales: se acepta hasta que llegue el aviso de borrador desfasado, que comparará el borrador con la foto del problema reutilizando `validateSchedule`.

Alternativa descartada: reconstruir las filas solo con las horas de las entradas: pierde los recreos y las franjas libres, que son justo lo que hace legible la tabla.

### D4. `ScheduleGrid`, un componente nuevo de solo lectura
`SlotGrid` es un control (botones, `aria-pressed`, cabeceras que marcan líneas); forzarlo a solo lectura con celdas ricas (asignatura, color, profesor o clase) complicaría un componente que ya tiene tres modos. `ScheduleGrid` recibe los periodos, las celdas ya calculadas (`{ day, session } → contenido`) y un `caption`, y comparte con `SlotGrid` las reglas visuales: días abreviados (L, M, X, J, V) por debajo de 768 px con `useMediaQuery`, las horas en la cabecera de fila y los recreos como fila de separación. La vista del colegio usa la misma tabla con las **clases** en columnas: el componente recibe las columnas como parámetro (días o clases).

### D5. Vista por profesor: una tabla por calendario
Un profesor puede dar clase en cursos de calendarios distintos, donde la «sesión 3» no es la misma hora. Se agrupan sus entradas por el calendario de su curso y se pinta una tabla por grupo, con el nombre del calendario en el `caption` (decisión de la persona usuaria). Con un solo calendario es una sola tabla. El motor garantiza que dos jornadas no se solapan (HC2), así que no hace falta verlas juntas.

Alternativa descartada: filas por tramo horario real mezclando calendarios (más difícil de leer) o una lista por día (pierde la forma de tabla de la clase).

### D6. Vista de todo el colegio: un día cada vez
Toda la semana de 12 clases son 360 celdas en una sola tabla. Se elige un día y se pinta, por calendario, una tabla con las sesiones en filas y las clases en columnas. A 360 px se desplaza en horizontal dentro de `.table-responsive`; la página no.

### D7. Estado en la URL, derivado al pintar
`?vista=clase|profesor|colegio&clase=<id>&profesor=<id>&dia=1..5`, con el patrón de `/alumnos`: se lee con funciones puras, se valida contra el borrador cargado (un valor que no existe se ignora y se usa el de por defecto) y se escribe con `setSearchParams(…, { replace: true })`. Así un enlace o una recarga conservan la vista, no se llena el historial y no hay estado duplicado. Solo ids; nunca nombres.

### D8. Capas
- **Dominio** (`domain/schedule/scheduleDraft.ts`): el tipo `ScheduleDraft` y el puerto `ScheduleDraftRepository.findDraft(schoolId)`.
- **Aplicación** (`application/schedule/getScheduleDraft.ts`): llama al puerto y ordena con `compareText` (cursos, clases, asignaturas; profesores por apellidos y nombre; entradas por clase, día y sesión). Vive en `application` porque `compareText` es de esa capa, como `buildCourseWorkload`.
- **Infraestructura** (`infrastructure/prisma/prismaScheduleDraftRepository.ts`): una llamada de Prisma, `schedule.findFirst({ where: { schoolId, status: 'DRAFT' } })` con las entradas y, de cada una, su asignatura, su profesor y su clase con el curso y su calendario con los periodos; después **normaliza** (cada curso, clase, asignatura y profesor una vez) y pasa los minutos a `HH:MM`. Los errores de conexión con `translateDatabaseErrors`.
- **Presentación:** la ruta en `scheduleRouter` (`requireAuthentication`, sin `requireRole`), con el colegio de `getAuthenticatedUser(res)`.

La consulta anidada repite el curso y su calendario en cada entrada de la misma clase; con 1000 entradas sigue siendo una sola ida y vuelta, y se prefiere a varias consultas (entradas, después cursos, asignaturas y profesores por ids), que serían más código para el mismo resultado. Si un colegio grande la hace lenta, se parte en dos consultas sin cambiar el contrato.

### D9. Horas en el contrato como `HH:MM`
Los periodos de los calendarios y la disponibilidad ya usan `HH:MM` en la API; las entradas del borrador también (`startTime`, `endTime`), aunque en la base de datos sean minutos. Así el frontend reutiliza sus utilidades de horas y el contrato es uniforme.

## Risks / Trade-offs

- **[Borrador desfasado: horas o profesores que cambiaron después de generar]** → la tabla usa el calendario actual y los nombres actuales; los dos desfases que pierden sesiones se muestran (D3) y el aviso general queda para una historia posterior.
- **[Tabla del colegio ancha en el móvil]** → desplazamiento dentro del contenedor y un día cada vez (D6).
- **[Respuesta grande en un colegio muy grande]** → normalizada (D1); unas 1000 entradas son decenas de KB.
- **[Seguridad]** → el colegio sale de la sesión (JWT y la sesión leída en cada petición); la ruta no recibe ids del cliente; `no-store`; los nombres se pintan como texto.
- **[Rendimiento de la generación]** → no cambia: esta historia solo lee.

## Migration Plan

Sin migración ni cambios de infraestructura. Se despliega como el resto (CI de `main`); revertir es retirar la ruta y la página, sin datos que deshacer.

## Open Questions

Ninguna: las decisiones de producto están validadas en la ficha (2026-11-04).
