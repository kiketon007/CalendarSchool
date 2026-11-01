## Context

US-PROF-SUMMARY cierra la épica 6: cruza tres datos que ya existen y que nada relaciona hoy:
- la carga de cada asignatura en cada curso (`subject_courses.sessions_per_week`, US19);
- quién la da en cada clase (`professor_assignments`, US-PROF-ASSIGN);
- cuándo no puede el profesor (`professor_unavailabilities`, en minutos, US-PROF-AVAIL).

A eso se añade la regla corregida en la exploración: un profesor tiene como máximo **23 h lectivas** a la semana (PRD §3.2), medidas en tiempo.

Lo que condiciona el diseño:
- **Las sesiones no duran lo mismo.** Cada curso sigue un calendario (`calendar_periods`, sesiones y recreos con inicio y fin), y un profesor puede dar clase en cursos con calendarios distintos. Hasta que el motor coloque las sesiones no se sabe cuáles le tocan, así que la duración exacta no existe todavía.
- **La disponibilidad son tramos horarios**, no números de sesión.
- **Hay un patrón de referencia:** el listado de reglas de reparto (US20, `GET /api/constraints`), que es de solo lectura, calcula avisos con funciones puras al leer y filtra en el cliente.

## Goals / Non-Goals

**Goals:**
- Un endpoint de solo lectura con el resumen de todos los profesores del colegio y las celdas sin profesor, calculado al leer y sin guardar nada.
- Un cálculo puro y probado con una tabla de casos, que dé un rango honrado (mínimo–máximo) y no un número que pueda engañar.
- Una página con filtros en el cliente, al estilo de `/reglas`.

**Non-Goals:**
- El detalle desplegable (US-PROF-SUMMARY_b), CSV y refresco automático.
- Comprobar los solapes entre calendarios distintos o las franjas prohibidas y preferidas: eso es el motor (HC2, HC4 y HC7).
- Guardar el resumen, reducciones por coordinación o máximos por profesor.

## Decisiones

### 1. La capa de cada pieza

| Pieza | Capa | Motivo |
|---|---|---|
| `teachingLoadOf`, `MAX_TEACHING_MINUTES` | `domain/professor/teachingLoad.ts` | Regla de negocio pura, sin dependencias (como `workloadWarnings`). Reutiliza la regla de solape de `availability.ts`. |
| `ProfessorsSummaryRepository` (puerto) | `domain/professor/` | Lo que necesita el caso de uso: los datos en bruto del colegio. |
| `PrismaProfessorsSummaryRepository` | `infrastructure/prisma/` | Las consultas y `translateDatabaseErrors`. |
| `GetProfessorsSummary` | `application/professors/` | Ordena con `compareText`, cuenta las celdas sin profesor, llama a `teachingLoadOf` y compone la respuesta (como `buildConstraintList`). |
| La ruta | `presentation/professors/professorsRouter.ts` | El recurso es de profesores; se registra **antes** de `/:id`. |

**Alternativa descartada:** un router propio montado antes de `/professors`, como `assignmentsRouter`. No hace falta: aquí no hay `:id` que fusionar, y una ruta más en el router de profesores, en el orden correcto y con un test, es más simple.

### 2. El rango: mínimo y máximo sobre las sesiones libres

Por cada calendario K, se ordenan las duraciones de las sesiones libres. El mínimo suma las carga_K más cortas y el máximo, las carga_K más largas. Por calendario es exacto: cualquier reparto de carga_K sesiones dentro de las libres cae dentro del rango, y los dos extremos se pueden alcanzar.

- **Por qué solo las libres:** si las sesiones largas son justo las que el profesor no puede dar, su carga real nunca llegará al máximo de todo el calendario, y un rango más estrecho es más útil.
- **Si no alcanzan las libres:** el rango se calcula con todas las sesiones de K y se avisa (`AVAILABILITY_INSUFFICIENT`). Así hay un número, y el rojo lo da el aviso.
- **Si la carga supera todas las sesiones de K:** cada sesión que sobra cuenta con la duración más corta (mínimo) y con la más larga (máximo). Es una convención fijada en la tabla de casos; ese curso ya avisa en su carga (`WORKLOAD_EXCEEDS_SLOTS`).

**Alternativas descartadas:**
- La duración media: da un solo número, pero puede marcar en verde a quien se pasaría.
- Medir en sesiones frente a las sesiones libres: no responde a la regla de las 23 h.

### 3. El estado sale solo de las horas, y los avisos aparte

`status` es solo el de las 23 h (`NO_LOAD`, `FITS`, `MAY_EXCEED`, `EXCEEDS`), como se acordó en la exploración. Los problemas de disponibilidad y de calendarios son avisos. Para encontrarlos, la página tiene «Solo con avisos», igual que `/reglas`.

**Alternativa descartada:** un estado «peor de todos» que mezcle horas y disponibilidad. Confunde lo que significa el rojo, y el filtro de avisos lo cubre.

### 4. Dos consultas, unidas en memoria

1. **Profesores del colegio** (`where: { schoolId }`), con:
   - sus tramos (`dayOfWeek`, `startMinute`, `endMinute`);
   - sus asignaciones con lo mismo que lee hoy `Professor.subjects` (asignatura, clase, curso y `sessionsPerWeek`), para reutilizar la composición y `withSortedSubjects`.
2. **Cursos del colegio**, con:
   - su calendario (`id`, `name`, periodos con `kind`, `startMinute` y `endMinute`);
   - `_count: { classes }`;
   - sus `subjectCourses` con `_count: { assignments }`.

   De ahí salen el calendario de cada curso (las duraciones se calculan **una vez por calendario**, no por asignación) y las celdas sin profesor (`clases − asignaciones` por asignatura).

**Alternativa descartada:** traer el calendario dentro de cada asignación. Repite los periodos en cada fila y complica deduplicar.

**Consistencia:** las dos consultas no van en una transacción. Un cambio entre las dos daría, como mucho, un aviso desfasado hasta la siguiente lectura. Es una foto informativa, como el resto de lecturas, sin bloqueos.

### 5. El formato de las horas, en el frontend

El backend devuelve minutos. `utils/teachingTime.ts` los formatea: «21 h 45 min», «20 h», «45 min», «0 min», y el rango con «–» (con espacios) cuando el mínimo y el máximo difieren. Las abreviaturas «h» y «min» son las mismas en los dos idiomas, así que la función es pura y no pasa por i18n.

### 6. Contrato

Los esquemas de la propuesta, todos los campos requeridos salvo los opcionales de cada aviso (sin `additionalProperties`, como el resto). Sin códigos de error nuevos: `401`, `500` y `503`. Sin evento de log, como `GET /api/constraints`.

### Rendimiento y seguridad

- **Rendimiento:** dos consultas para el colegio entero. El cálculo es O(asignaciones + sesiones · log sesiones) por profesor, en memoria: decenas de profesores y, como mucho, 40 sesiones por calendario. No toca el motor, así que no afecta a los límites de 60 s y 120 s de la generación.
- **Seguridad:**
  - Bearer obligatorio; `schoolId` de la identidad, en las dos consultas;
  - lectura para `ADMIN` y `MEMBER`, sin `requireRole`;
  - `no-store` por defecto en `/api`;
  - sin nombres en los logs, porque no hay evento.

### Modelo de datos

Sin cambios: ni tablas, ni índices, ni migración. Las consultas usan las claves ajenas ya indexadas (`professor_id`, `course_id`, `calendar_id`).

## Risks / Trade-offs

- **[El rango no ve los solapes entre calendarios distintos]** → aviso `SEVERAL_CALENDARS` en la fila. HC2 (un profesor no está en dos sitios a la vez) y HC7 los resuelven en el motor.
- **[La convención de las sesiones que sobran]** → fijada en `test-fixtures/teaching-load.json` y explicada en el código. Solo ocurre cuando la carga del curso ya no cabe en su calendario, que tiene su propio aviso.
- **[`/summary` capturado por `/:id`]** → la ruta se registra antes, y un test de la ruta y otro de integración piden `/api/professors/summary` y esperan `200`.
- **[Datos de las dos consultas desfasados en una carrera]** → se acepta: es una foto y la siguiente lectura la corrige. No hay escritura.
- **[Volumen de la respuesta]** → solo lleva lo que se muestra (sin celdas ni periodos); para un colegio típico son unos pocos KB.
- **[Carrera ya existente, intermitente en la suite completa]** El `PUT` de asignaciones también leía `classes` sin bloquear, y una clase borrada por otro camino entre la comprobación y el `INSERT` daba `P2003` y `500` → el `PUT` bloquea las clases del curso con `FOR SHARE` en orden de `id` tras las parejas, y un test determinista (una transacción que borra la clase y no confirma) sustituye a la dependencia de los tiempos. Dentro de la aplicación no podía ocurrir (borrar una clase exige el bloqueo del curso), así que es endurecimiento, no un fallo visible.

## Migration Plan

Sin migración. Se despliega como siempre (backend y frontend juntos). Un frontend antiguo no conoce la ruta, y uno nuevo contra un backend antiguo recibe `404` y muestra el error con «Reintentar» durante los minutos del despliegue. Rollback: revertir el commit.

## Open Questions

Ninguna. Las decisiones de la exploración (2026-11-01) y las que tomé en `enrich-us` sobre el estado, la convención de las sesiones que sobran, el profesor sin calendario y el enlace desde `/profesores` quedaron aceptadas al continuar. «Solo con avisos» se añade por coherencia con `/reglas`, y el recuento y «Limpiar filtros» siguen el mismo patrón.
