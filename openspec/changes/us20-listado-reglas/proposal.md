## Why

Las reglas de reparto (máximo al día, bloques, franjas prohibidas y franjas preferidas, US19_b–US19_d) se definen asignatura a asignatura dentro de la carga de cada curso. Hoy no hay un sitio donde ver **todas** las del colegio, ni sus problemas, antes de generar los horarios: hay que abrir curso por curso. La historia es **US20** de `docs/User_Stories_MVP.md` (épica 5, «Configuración de Horarios»), que desarrolla el punto 3.5 del PRD (gestión de restricciones) y su línea 92: el miembro **ve** las restricciones pero no las gestiona.

Las cuatro reglas ya existen en `scheduling_constraints` y `scheduling_constraint_slots`, y sus avisos son funciones puras del dominio (`subjectWarnings` y `preferredSlotsWarnings`). **No hay migraciones.**

## What Changes

- **API:** `GET /api/constraints` (`listConstraints`, `ADMIN` y `MEMBER`, `no-store`). Devuelve todas las reglas del colegio, una por `(asignatura, curso, tipo)`. Cada una lleva su curso, su asignatura (con color y estado), su valor (`maxPerDay`, `blockSize` o `slotCount`) y **sus** avisos. Van ordenadas por curso, asignatura y tipo. Sin códigos de error nuevos.
- **Avisos por regla:** se calculan con las mismas funciones que la carga del curso y se reparten según la regla a la que afectan:
  - «no cabe», en las obligatorias;
  - «bloque mayor que la carga», en bloques;
  - celdas fuera del calendario, en cada cuadrícula con su propio recuento;
  - «preferidas prohibidas», en las preferidas;
  - «curso sin calendario», en todas las reglas de ese curso.
- **Frontend:** una página nueva, `/reglas` («Reglas de reparto»), para los dos roles. Lleva:
  - una tabla desde 768 px y tarjetas por debajo;
  - filtros en el cliente por tipo, curso, búsqueda por nombre o código y «Solo con avisos», combinables;
  - el recuento de lo que se ve, el estado vacío y el de sin coincidencias;
  - un enlace por regla a la carga del curso o a su cuadrícula: «Editar» para el `ADMIN` y «Ver» para el `MEMBER`.
- **Navegación:** la cabecera gana «Reglas» tras «Asignaturas», para los dos roles.

**Correcciones a la ficha**, ya aplicadas en `docs/User_Stories_MVP.md` y validadas el 2026-10-31:
- Cada fila muestra **los avisos de su regla**, no todos los de la asignatura. Si no, los mismos avisos se repetirían en cada regla y la del máximo diría «preferidas prohibidas».
- La ruta es `/reglas` y no `/restricciones`, como su título y su enlace. La API sigue en `/api/constraints`, como la tabla.
- Lo que la ficha no decía:
  - qué cuenta `slotCount`: las celdas dentro del calendario actual;
  - que la asignatura puede estar inactiva;
  - qué pasa con el curso sin calendario;
  - de dónde salen las opciones del filtro de curso;
  - que la consulta no hace una lectura por curso.

**Fuera de alcance:**
- Editar o borrar desde el listado.
- Estado activo o inactivo de una regla.
- Paginación o filtros en el servidor, y filtros en la URL.
- La disponibilidad de los profesores (US-PROF-AVAIL).
- Exportar el listado.
- Comprobar si el horario completo es posible (US-ALGO-RUN).

## Capabilities

### New Capabilities
- `constraints-list`: el listado de las reglas de reparto del colegio, con sus avisos por regla, su página `/reglas`, sus filtros y el enlace de la cabecera.

### Modified Capabilities
Ninguna: la carga del curso, las cuadrículas y sus avisos no cambian; el listado solo los lee.

## Impact

- **Backend:**
  - un puerto y su repositorio Prisma: lee de una vez las parejas con reglas del colegio, con sus celdas y el calendario de su curso;
  - una función de aplicación que reparte los avisos con las funciones existentes de `domain/workload/workloadWarnings.ts`;
  - el caso de uso `ListConstraints`, su `constraintsRouter` montado en `/api/constraints` y el cableado en `composeApp`.
- **Frontend:** `services/constraintsService.ts`, `utils/constraintFilters.ts`, `pages/ConstraintsPage.tsx`, la ruta en `App.tsx`, el enlace en `AppHeader.tsx` e i18n. Reutiliza `SubjectWarnings`, `SubjectColorSwatch`, `useMediaQuery` y `matchesCourseSearch`.
- **Contrato:** `docs/api-spec.yml`, con la operación `listConstraints` y los esquemas `SchedulingConstraint` y `ConstraintType`. Reutiliza `WorkloadWarning`.
- **Modelo de datos:** sin cambios. `MODELO_DATOS.md` solo anota quién lee las reglas.
- **Pruebas:** unitarias, de integración (aislamiento por colegio y recuentos), de frontend (con `axe`) y E2E (`cypress/e2e/constraints.cy.ts`).
- **Docs:**
  - `README.md`;
  - los `CLAUDE.md` de la raíz y de las dos capas;
  - la arquitectura;
  - `docs/User_Stories_MVP.md`, con el estado de la épica.
- **Infraestructura:** ninguna, porque CloudFront ya reenvía `/api/*` y la SPA sirve cualquier ruta.
