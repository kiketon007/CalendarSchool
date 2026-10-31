## Why

Para generar horarios (US-ALGO-RUN), el motor tiene que saber cuándo no puede dar clase cada profesor (HC4): especialistas que solo vienen algunos días, profesores que entran más tarde o reducciones de jornada. Hoy no hay dónde decirlo. La historia es **US-PROF-AVAIL** de `docs/User_Stories_MVP.md` (épica 6, «Asignación de Horarios y Disponibilidad de Profesores»), que desarrolla los puntos del PRD sobre la disponibilidad del personal: líneas 16, 44, 112 y 162.

Un profesor da clase en cursos que pueden seguir calendarios distintos, y la «sesión 3» no es la misma hora en todos. Por eso la disponibilidad se guarda **por horas** y la cuadrícula es solo una vista sobre el calendario elegido. Es la opción B de la exploración del 2026-10-31.

## What Changes

- **Modelo:** tabla nueva `professor_unavailabilities` con los tramos no disponibles `(día, inicio, fin)`, en minutos, con `CHECK` escritos a mano y en cascada desde `professors`. Un profesor sin tramos está disponible siempre. Una migración.
- **API:**
  - `GET` y `PUT /api/professors/{id}/availability` para `ADMIN` y `MEMBER`. El `PUT` recibe el estado final con horas «HH:MM», como los calendarios, y el servidor lo normaliza: ordena y une los tramos que se solapan o se tocan.
  - `Professor` gana `unavailableCount`, un cambio compatible.
  - No hay códigos de error nuevos.
- **Frontend:**
  - una página `/profesores/:id/disponibilidad` con la cuadrícula de las sesiones de un calendario (con selector si el colegio tiene más de uno);
  - tres estados por celda: disponible, no disponible y parcial;
  - las cabeceras de día y de sesión y «Disponible todo»;
  - un resumen de franjas disponibles;
  - lo marcado desde otro calendario se conserva;
  - `SlotGrid` gana un modo para esta cuadrícula;
  - el listado de profesores enlaza «Disponibilidad ({n} tramos)».
- **Motor:** se anota en `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` que HC4 se comprueba por solape de horas y que HC2 deberá comparar horas cuando los cursos sigan calendarios distintos.

**Correcciones a la ficha**, ya aplicadas en `docs/User_Stories_MVP.md` y validadas el 2026-10-31:
- Se guardan horas, no números de sesión.
- Se guarda solo lo no disponible: `isAvailable DEFAULT FALSE` obligaba a rellenarlo todo.
- Fuera los botones «Solo mañana», «Solo tarde» e «Inversión rápida».
- Fuera los avisos de reducción del 50 % y de asignaciones y horarios en `NEEDS_REVIEW`.
- Caracteres corruptos y CA rotos corregidos.

**Correcciones de documentación en la misma rama:**
- `ARQUITECTURA_COMPLETA.md` citaba «US21 en adelante», una historia que no existe. Pasa a «Por definir».
- `README.md` marcaba con ✅ los módulos 6 a 9 y partes de «Seguridad & Auditoría» que no están implementados. Pasan a 🎯.

**Fuera de alcance:**
- El máximo de horas por coordinación o reducción.
- El aviso de disponibilidad insuficiente para la carga (US-PROF-ASSIGN, US-PROF-SUMMARY).
- Las preferencias horarias del profesor.
- La disponibilidad distinta por semana o por trimestre.
- El sábado y el domingo.
- Marcar los recreos.
- Avisar en el diálogo de borrado del profesor.
- Implementar HC2 y HC4 en el motor (US-ALGO-RUN).

## Capabilities

### New Capabilities
- `professor-availability`: guardar y leer los tramos no disponibles de un profesor (normalización, validación, estado final, concurrencia, aislamiento), su página con la cuadrícula sobre un calendario y sus eventos.

### Modified Capabilities
- `school-professors`: `Professor` lleva `unavailableCount` y el listado enlaza la disponibilidad de cada profesor.

## Impact

- **Backend:**
  - `schema.prisma` y una migración;
  - `domain/professor/availability.ts`, con la normalización pura;
  - los casos de uso `GetProfessorAvailability` y `UpdateProfessorAvailability`, con su parser;
  - un repositorio Prisma nuevo;
  - las rutas en `professorsRouter`;
  - el recuento en `PrismaProfessorRepository`.
- **Frontend:**
  - `professorAvailabilityService`;
  - `utils/professorAvailability.ts`, puro: celdas ↔ tramos;
  - el modo nuevo de `SlotGrid`;
  - `ProfessorAvailabilityPage`, con su ruta y el enlace en `ProfessorsPage`;
  - i18n.
  - `professorsService` exige `unavailableCount`.
- **Tabla compartida:** `test-fixtures/professor-unavailability-normalization.json`, que recorren el backend y el frontend.
- **Contrato:** `docs/api-spec.yml`, con dos operaciones, `ProfessorUnavailability` y `Professor.unavailableCount`.
- **Docs:** `MODELO_DATOS.md` (la tabla sustituye a `professor_availabilities`), `README.md`, los `CLAUDE.md`, la arquitectura y la especificación del motor.
- **Infraestructura:** ninguna. La migración se aplica en el despliegue habitual.
