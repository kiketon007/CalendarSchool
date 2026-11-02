## Context

US-PROF-SUMMARY dejó en `/profesores/resumen` el rango de minutos lectivos de cada profesor, su estado y sus avisos, calculados por `teachingLoadOf` (`domain/professor/teachingLoad.ts`), que ya recorre calendario a calendario. El resultado solo conserva la suma; el desglose por calendario se pierde. La disponibilidad de un profesor ya tiene su endpoint (`GET /api/professors/{id}/availability`) y su cuadrícula (`SlotGrid` en modo `unavailable`), con las utilidades que la pintan sobre las sesiones de un calendario (`utils/professorAvailability`: `fromApi`, `sessionsOf`, `cellStates`, `defaultCalendar`). Los calendarios con sus periodos ya se leen con `GET /api/calendars` (`calendarsService.list`).

## Goals / Non-Goals

**Goals:**
- Explicar la carga de un profesor sin salir del resumen: asignaciones, desglose por calendario, disponibilidad y qué hacer con cada aviso.
- No duplicar el cálculo: el desglose sale de la misma función que el total.
- No añadir endpoints: el detalle reutiliza los que existen.

**Non-Goals:**
- La «timeline» del horario (US-ALGO), editar desde el detalle, CSV, varios detalles abiertos.

## Decisions

### 1. El desglose viaja en el resumen y sale de `teachingLoadOf`

`TeachingLoad` gana `calendars` (`{ calendar, sessions, available, minMinutes, maxMinutes }` por calendario, por nombre con el comparador inyectado). Se construye en el mismo bucle que ya ordena los calendarios por nombre, así que el total es por construcción la suma del desglose. `GetProfessorsSummary` lo pasa por el `...load` que ya existe, y el repositorio y la ruta no cambian.

**Alternativas descartadas:**
- Un endpoint nuevo por profesor: más contrato para lo mismo.
- Calcular el desglose en el frontend: duplica una regla nueva.

### 2. La disponibilidad y los calendarios se piden al desplegar

La cuadrícula necesita los tramos del profesor y los periodos de los calendarios, que no están en el resumen y pesan bastante más que el desglose. Se piden solo para el profesor desplegado; los calendarios, una vez por visita (una `ref` en la página), porque son los mismos para todos.

- **Una respuesta tardía se descarta:** si llega cuando ya no es el desplegado, no se pinta. La página guarda el id del desplegado y compara al recibir.
- **El error es local:** un `Alert` dentro de la sección de disponibilidad, con «Reintentar». Lo demás del detalle no depende de esas peticiones.

**Alternativa descartada:** meter los tramos y los periodos en el resumen. Multiplica la respuesta por el número de profesores para pintar uno solo.

### 3. Un componente de presentación y el estado en la página

- **`components/ProfessorLoadDetail.tsx`** pinta las cuatro secciones a partir de: el `ProfessorLoad`, los calendarios (o su estado de carga), la disponibilidad (o su estado) y `onRetry`. El calendario elegido en el selector es estado propio del componente; empieza en el de mayor carga.
- **`ProfessorsSummaryPage`** tiene el id del profesor desplegado, la caché de calendarios y la disponibilidad del desplegado. Un efecto cierra el detalle si el profesor desplegado deja de estar en la lista filtrada.
- En la tabla, el detalle va en una `<tr>` siguiente con una `<td colSpan={7}>`; en las tarjetas, dentro de `Card.Body`. El botón va en la columna «Acciones» o al pie de la tarjeta.

### 4. La duración de las sesiones sale de los periodos del calendario del curso

Para «sesiones de X a Y min» hace falta saber qué calendario sigue cada curso. El resumen no lo dice por asignación, pero `GET /api/calendars` devuelve cada calendario con sus `courses`; con eso, y con los periodos de tipo sesión, se calculan la duración mínima y la máxima. Mientras los calendarios cargan, la línea de la asignación muestra sus sesiones sin la duración, y se completa al llegar.

**Alternativa descartada:** añadir el calendario a cada `ProfessorSubject`. Cambiaría un esquema que usan otras pantallas (el listado y el borrado de profesores) solo para esta.

### 5. Validación del servicio

`professorsSummaryService` valida cada entrada de `calendars` y que la suma de sus rangos coincida con el rango del profesor. Una respuesta incoherente es `unavailable`: es un error del servidor, no algo que la página deba disimular.

### Rendimiento y seguridad

- **Rendimiento:** el desglose añade unas pocas líneas por profesor. El detalle hace como mucho dos peticiones al desplegar, y los calendarios solo la primera vez. No afecta al motor.
- **Seguridad:** sin cambios. Los endpoints reutilizados ya aíslan por colegio y admiten `ADMIN` y `MEMBER`.

### Modelo de datos

Sin cambios ni migraciones.

## Risks / Trade-offs

- **[Coherencia del desglose y el total]** → se construyen en el mismo bucle; la tabla de casos y la validación del servicio lo fijan.
- **[Respuesta tardía al desplegar deprisa]** → se descarta si el profesor ya no es el desplegado; hay un test.
- **[La cuadrícula es por número de sesión]** → se pinta sobre las sesiones del calendario elegido con las horas de los tramos, como en la página de disponibilidad; un tramo que no toca ninguna sesión de ese calendario no se ve en él.
- **[Duración que tarda en aparecer]** → la línea de la asignación se completa al llegar los calendarios; sin ellos (error), muestra solo las sesiones.

## Migration Plan

Sin migración. Se despliega como siempre. Un frontend antiguo ignora el campo nuevo; uno nuevo contra un backend antiguo daría `unavailable` porque `calendars` es requerido, solo durante los minutos del despliegue. Rollback: revertir el commit.

## Open Questions

Ninguna. Las decisiones de la exploración y del enriquecimiento del 2026-11-01 están validadas.
