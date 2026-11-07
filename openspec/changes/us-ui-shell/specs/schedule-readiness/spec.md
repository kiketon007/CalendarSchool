## MODIFIED Requirements

### Requirement: Página «Generar horarios»
`/horarios` (`pages/ScheduleReadinessPage.tsx`, título «Generar horarios») MUST colgar de `AuthenticatedLayout` sin `RequireRole`. La navegación de la barra lateral MUST enlazar «Horarios» para los dos roles, al final de «Espacio de trabajo», con `aria-current="page"` en `/horarios` y sus subrutas.

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
  - `WORKLOAD_EXCEEDS_SLOTS`, `WORKLOAD_BELOW_SLOTS`, `BLOCK_LARGER_THAN_LOAD`, `SUBJECT_DOES_NOT_FIT` y `COURSE_WITHOUT_SUBJECTS` → la carga del curso (`/cursos/{id}/carga`);
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
- **THEN** la barra lateral tiene «Horarios», que lleva a `/horarios`

#### Scenario: Texto del aviso de huecos libres
- **GIVEN** un `WORKLOAD_BELOW_SLOTS` de 1º Primaria con 25 sesiones para 30
- **THEN** veo, en el grupo de avisos, «1º Primaria tiene 25 sesiones para 30 franjas: quedarán 5 huecos libres en cada clase» con un enlace a la carga de 1º Primaria
- **AND** con una sola franja de diferencia el texto dice «quedará 1 hueco libre»
